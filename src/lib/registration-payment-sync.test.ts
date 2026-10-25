import { describe, expect, it, vi } from 'vitest';

import type { RegistrationPaymentRow } from '@/lib/registration-payment-finalize';
import {
  clampPendingPaymentSyncLimit,
  listPendingRegistrationsForPaymentSync,
  resolveRegistrationPaymentScope,
  syncOneRegistrationPaymentFromZeffy,
  syncPendingRegistrationPaymentsFromZeffy,
} from '@/lib/registration-payment-sync';

function pendingRow(overrides: Partial<RegistrationPaymentRow> = {}): RegistrationPaymentRow {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'ada@example.com',
    registration_type: 'diaspora_nurses_allied_health',
    needs_housing: false,
    room_type: null,
    occupancy_type: null,
    registration_amount: 100,
    housing_amount: 0,
    total_amount: 100,
    payment_status: 'pending',
    checkout_correlation_reference: 'ADNA26-token',
    conference_id: '22222222-2222-2222-2222-222222222222',
    created_at: '2026-09-02T12:00:00.000Z',
    payment_sync_checked_at: null,
    ...overrides,
  };
}

describe('listPendingRegistrationsForPaymentSync', () => {
  it('throws when the pending query fails', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            or: () => ({
              or: () => ({
                order: () => ({
                  order: () => ({
                    limit: async () => ({ data: null, error: { message: 'query failed' } }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    };
    await expect(listPendingRegistrationsForPaymentSync(supabase as never, 5)).rejects.toThrow(/query failed/);
  });
});

describe('clampPendingPaymentSyncLimit', () => {
  it('defaults, clamps, and parses query strings', () => {
    expect(clampPendingPaymentSyncLimit(undefined)).toBe(10);
    expect(clampPendingPaymentSyncLimit(0)).toBe(1);
    expect(clampPendingPaymentSyncLimit(500)).toBe(25);
    expect(clampPendingPaymentSyncLimit('15')).toBe(15);
  });
});

describe('resolveRegistrationPaymentScope', () => {
  it('uses the global campaign id when no conference is linked', async () => {
    vi.stubEnv('ZEFFY_CAMPAIGN_ID', 'global-campaign');
    const scope = await resolveRegistrationPaymentScope({} as never, pendingRow({ conference_id: null }));
    expect(scope.campaignId).toBe('global-campaign');
    expect(scope.createdGteUnix).toBeGreaterThan(0);
  });

  it('loads conference-specific campaign ids from Supabase', async () => {
    vi.stubEnv('ZEFFY_CAMPAIGN_ID_GHANA_2027', 'slug-campaign');
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { slug: 'ghana-2027', zeffy_campaign_id: null },
              error: null,
            }),
          }),
        }),
      }),
    };
    await expect(resolveRegistrationPaymentScope(supabase as never, pendingRow())).resolves.toEqual({
      campaignId: 'slug-campaign',
      createdGteUnix: expect.any(Number),
    });
  });

  it('throws when the conference lookup fails', async () => {
    const failing = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: { message: 'db timeout' } }),
          }),
        }),
      }),
    };
    await expect(resolveRegistrationPaymentScope(failing as never, pendingRow())).rejects.toThrow(
      /db timeout/,
    );
  });

  it('throws when the linked conference is missing or lacks a campaign id', async () => {
    const missing = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    };
    await expect(resolveRegistrationPaymentScope(missing as never, pendingRow())).rejects.toThrow(
      /conference not found/i,
    );

    const noCampaign = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { slug: 'usa-2026' }, error: null }),
          }),
        }),
      }),
    };
    await expect(resolveRegistrationPaymentScope(noCampaign as never, pendingRow())).rejects.toThrow(
      /campaign ID is not configured/i,
    );
  });
});

describe('syncOneRegistrationPaymentFromZeffy', () => {
  it('retries confirmation for rows already marked paid', async () => {
    const sendConfirmation = vi.fn(async () => true);
    const result = await syncOneRegistrationPaymentFromZeffy(
      {} as never,
      pendingRow({ payment_status: 'paid' }),
      {
        matchPayment: vi.fn(),
        finalize: vi.fn(),
        sendConfirmation,
        resolvePaymentScope: vi.fn(),
      },
    );
    expect(result).toMatchObject({ outcome: 'paid', alreadyPaid: true });
    expect(sendConfirmation).toHaveBeenCalledOnce();
  });

  it('returns a structured error result for upstream failures', async () => {
    const result = await syncOneRegistrationPaymentFromZeffy({} as never, pendingRow(), {
      matchPayment: async () => ({ error: 'upstream unavailable' }),
      finalize: vi.fn(),
      sendConfirmation: vi.fn(),
      resolvePaymentScope: async () => ({ createdGteUnix: 1 }),
    });
    expect(result).toEqual({
      outcome: 'error',
      message: 'upstream unavailable',
      httpStatus: 503,
    });
  });

  it('returns an error when email is missing', async () => {
    const result = await syncOneRegistrationPaymentFromZeffy(
      {} as never,
      pendingRow({ email: undefined }),
      {
        matchPayment: vi.fn(),
        finalize: vi.fn(),
        sendConfirmation: vi.fn(),
        resolvePaymentScope: vi.fn(),
      },
    );
    expect(result).toEqual({
      outcome: 'error',
      message: 'Registration email unavailable.',
      httpStatus: 500,
    });
  });

  it('marks a matching Zeffy payment as paid and sends confirmation', async () => {
    const sendConfirmation = vi.fn(async () => true);
    const finalize = vi.fn(async () => ({
      outcome: 'paid' as const,
      registrationId: pendingRow().id,
    }));
    const matchPayment = vi.fn(async () => ({
      paymentId: 'pay_123',
      status: 'succeeded',
      amountCents: 10000,
      currencyLower: 'usd',
    }));

    const result = await syncOneRegistrationPaymentFromZeffy(
      {} as never,
      pendingRow(),
      {
        matchPayment,
        finalize,
        sendConfirmation,
        resolvePaymentScope: async () => ({
          campaignId: 'campaign_ghana_2027',
          createdGteUnix: 1_777_809_300,
        }),
      },
    );

    expect(result).toMatchObject({
      outcome: 'paid',
      providerPaymentId: 'pay_123',
      alreadyPaid: false,
    });
    expect(finalize).toHaveBeenCalledOnce();
    expect(matchPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: 'campaign_ghana_2027',
        createdGteUnix: 1_777_809_300,
      }),
    );
    expect(sendConfirmation).toHaveBeenCalledWith({}, pendingRow().id);
  });

  it('maps rejected and upstream failures', async () => {
    const baseDeps = () => ({
      matchPayment: vi.fn(),
      finalize: vi.fn(),
      sendConfirmation: vi.fn(),
      resolvePaymentScope: async () => ({ createdGteUnix: 1 }),
    });

    const upstream = baseDeps();
    upstream.matchPayment.mockResolvedValue({ error: 'upstream unavailable' });
    await expect(syncOneRegistrationPaymentFromZeffy({} as never, pendingRow(), upstream)).resolves.toEqual({
      outcome: 'error',
      message: 'upstream unavailable',
      httpStatus: 503,
    });

    const rejected = baseDeps();
    rejected.matchPayment.mockResolvedValue({
      paymentId: 'pay_1',
      status: 'succeeded',
      amountCents: 10_000,
      currencyLower: 'usd',
    });
    rejected.finalize.mockResolvedValue({ outcome: 'rejected', reason: 'amount_mismatch' });
    await expect(syncOneRegistrationPaymentFromZeffy({} as never, pendingRow(), rejected)).resolves.toEqual({
      outcome: 'rejected',
      registrationId: pendingRow().id,
      reason: 'amount_mismatch',
    });

    const dbError = baseDeps();
    dbError.matchPayment.mockResolvedValue({
      paymentId: 'pay_1',
      status: 'succeeded',
      amountCents: 10_000,
      currencyLower: 'usd',
    });
    dbError.finalize.mockResolvedValue({ outcome: 'db_error', message: 'rpc failed' });
    await expect(syncOneRegistrationPaymentFromZeffy({} as never, pendingRow(), dbError)).resolves.toEqual({
      outcome: 'error',
      message: 'rpc failed',
      httpStatus: 500,
    });
  });

  it('leaves the row pending when Zeffy has no matching payment yet', async () => {
    const result = await syncOneRegistrationPaymentFromZeffy({} as never, pendingRow(), {
      matchPayment: async () => ({ notFoundReason: 'no_matching_payment_yet' }),
      finalize: vi.fn(),
      sendConfirmation: vi.fn(),
      resolvePaymentScope: async () => ({ createdGteUnix: 1_777_809_300 }),
    });

    expect(result).toEqual({
      outcome: 'pending',
      registrationId: pendingRow().id,
      amountUsd: 100,
      reason: 'no_matching_payment_yet',
    });
  });
});

describe('syncPendingRegistrationPaymentsFromZeffy', () => {
  it('walks pending rows and counts paid vs still-pending', async () => {
    const paid = pendingRow({ id: 'paid-1', email: 'paid@example.com' });
    const waiting = pendingRow({ id: 'wait-1', email: 'wait@example.com', total_amount: 200 });

    const orderCalls: Array<{ column: string; options: unknown }> = [];
    const supabase = {
      from: () => ({
        select: (columns: string) => {
          if (columns === 'id') {
            return {
              eq: () => ({
                is: () => ({
                  order: () => ({
                    limit: async () => ({ data: [], error: null }),
                  }),
                }),
              }),
            };
          }
          return {
            eq: () => ({
              or: () => ({
                or: () => {
                  const ordered = {
                    order: (column: string, options: unknown) => {
                      orderCalls.push({ column, options });
                      return ordered;
                    },
                    limit: async () => ({ data: [paid, waiting], error: null }),
                  };
                  return ordered;
                },
              }),
            }),
          };
        },
        update: () => ({
          in: async () => ({ error: null }),
        }),
      }),
    };

    const matchPayment = vi.fn(async (opts: { email: string }) => {
      if (opts.email === 'paid@example.com') {
        return {
          paymentId: 'pay_paid',
          status: 'succeeded',
          amountCents: 10000,
          currencyLower: 'usd',
        };
      }
      return { notFoundReason: 'no_matching_payment_yet' };
    });
    const finalize = vi.fn(async (_sb: unknown, row: RegistrationPaymentRow) => ({
      outcome: 'paid' as const,
      registrationId: row.id,
    }));
    const sendConfirmation = vi.fn(async () => true);

    const summary = await syncPendingRegistrationPaymentsFromZeffy(
      supabase as never,
      { limit: 50 },
      {
        matchPayment,
        finalize,
        sendConfirmation,
        resolvePaymentScope: async () => ({ createdGteUnix: 1_777_809_300 }),
      },
    );

    expect(summary).toEqual({
      checked: 2,
      paid: 1,
      pending: 1,
      rejected: 0,
      confirmationRetriesChecked: 0,
      confirmationRetriesSent: 0,
      confirmationRetriesFailed: 0,
      errors: [],
    });
    expect(finalize).toHaveBeenCalledOnce();
    expect(sendConfirmation).toHaveBeenCalledWith(supabase, 'paid-1');
    expect(orderCalls).toEqual([
      {
        column: 'payment_sync_checked_at',
        options: { ascending: true, nullsFirst: true },
      },
      { column: 'created_at', options: { ascending: false } },
    ]);
  });

  it('retries confirmation emails for paid rows that remain unsent', async () => {
    const supabase = {
      from: () => ({
        select: (columns: string) => {
          if (columns === 'id') {
            return {
              eq: () => ({
                is: () => ({
                  order: () => ({
                    limit: async () => ({ data: [{ id: 'retry-1' }], error: null }),
                  }),
                }),
              }),
            };
          }
          return {
            eq: () => ({
              or: () => ({
                or: () => {
                  const ordered = {
                    order: () => ordered,
                    limit: async () => ({ data: [], error: null }),
                  };
                  return ordered;
                },
              }),
            }),
          };
        },
      }),
    };
    const sendConfirmation = vi.fn(async () => true);

    const summary = await syncPendingRegistrationPaymentsFromZeffy(
      supabase as never,
      {},
      {
        matchPayment: vi.fn(),
        finalize: vi.fn(),
        sendConfirmation,
        resolvePaymentScope: vi.fn(),
      },
    );

    expect(summary).toMatchObject({
      checked: 0,
      confirmationRetriesChecked: 1,
      confirmationRetriesSent: 1,
      confirmationRetriesFailed: 0,
      errors: [],
    });
    expect(sendConfirmation).toHaveBeenCalledWith(supabase, 'retry-1');
  });

  it('records confirmation retry failures and sync exceptions', async () => {
    const supabase = {
      from: () => ({
        select: (columns: string) => {
          if (columns === 'id') {
            return {
              eq: () => ({
                is: () => ({
                  order: () => ({
                    limit: async () => ({ data: [{ id: 'retry-fail' }], error: null }),
                  }),
                }),
              }),
            };
          }
          return {
            eq: () => ({
              or: () => ({
                or: () => {
                  const ordered = { order: () => ordered, limit: async () => ({ data: [], error: null }) };
                  return ordered;
                },
              }),
            }),
          };
        },
        update: () => ({ in: async () => ({ error: null }) }),
      }),
    };

    const summary = await syncPendingRegistrationPaymentsFromZeffy(
      supabase as never,
      {},
      {
        matchPayment: vi.fn(),
        finalize: vi.fn(),
        sendConfirmation: vi.fn(async () => false),
        resolvePaymentScope: vi.fn(),
      },
    );
    expect(summary.confirmationRetriesFailed).toBe(1);
    expect(summary.errors[0]?.message).toMatch(/not sent/i);
  });

  it('records non-Error sync and confirmation failures', async () => {
    const row = pendingRow({ id: 'throw-1' });
    const syncSummary = await syncPendingRegistrationPaymentsFromZeffy(
      {
        from: () => ({
          select: () => ({
            eq: () => ({
              or: () => ({
                or: () => {
                  const ordered = {
                    order: () => ordered,
                    limit: async () => ({ data: [row], error: null }),
                  };
                  return ordered;
                },
              }),
              is: () => ({
                order: () => ({ limit: async () => ({ data: [], error: null }) }),
              }),
            }),
          }),
          update: () => ({ in: async () => ({ error: null }) }),
        }),
      } as never,
      {},
      {
        matchPayment: vi.fn(async () => {
          throw 'boom';
        }),
        finalize: vi.fn(),
        sendConfirmation: vi.fn(),
        resolvePaymentScope: async () => ({ createdGteUnix: 1 }),
      },
    );
    expect(syncSummary.errors[0]?.message).toBe('Unexpected sync error');

    const confirmSummary = await syncPendingRegistrationPaymentsFromZeffy(
      {
        from: () => ({
          select: (columns: string) => {
            if (columns === 'id') {
              return {
                eq: () => ({
                  is: () => ({
                    order: () => ({
                      limit: async () => ({ data: [{ id: 'retry-throw' }], error: null }),
                    }),
                  }),
                }),
              };
            }
            return {
              eq: () => ({
                or: () => ({
                  or: () => {
                    const ordered = { order: () => ordered, limit: async () => ({ data: [], error: null }) };
                    return ordered;
                  },
                }),
              }),
            };
          },
          update: () => ({ in: async () => ({ error: null }) }),
        }),
      } as never,
      {},
      {
        matchPayment: vi.fn(),
        finalize: vi.fn(),
        sendConfirmation: vi.fn(async () => {
          throw 'retry boom';
        }),
        resolvePaymentScope: vi.fn(),
      },
    );
    expect(confirmSummary.errors[0]?.message).toBe('Confirmation retry failed');
  });

  it('returns empty lists when Supabase data is null', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            or: () => ({
              or: () => {
                const ordered = {
                  order: () => ordered,
                  limit: async () => ({ data: null, error: null }),
                };
                return ordered;
              },
            }),
            is: () => ({
              order: () => ({
                limit: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        }),
        update: () => ({ in: async () => ({ error: null }) }),
      }),
    };
    const summary = await syncPendingRegistrationPaymentsFromZeffy(supabase as never, {}, {
      matchPayment: vi.fn(),
      finalize: vi.fn(),
      sendConfirmation: vi.fn(),
      resolvePaymentScope: vi.fn(),
    });
    expect(summary.checked).toBe(0);
    expect(summary.confirmationRetriesChecked).toBe(0);
  });

  it('continues when confirmation retry columns are missing in Supabase', async () => {
    const supabase = {
      from: () => ({
        select: (columns: string) => {
          if (columns === 'id') {
            return {
              eq: () => ({
                is: () => ({
                  order: () => ({
                    limit: async () => ({
                      data: null,
                      error: {
                        message: 'column conference_registrations.confirmation_email_sent_at does not exist',
                      },
                    }),
                  }),
                }),
              }),
            };
          }
          return {
            eq: () => ({
              or: () => ({
                or: () => {
                  const ordered = { order: () => ordered, limit: async () => ({ data: [], error: null }) };
                  return ordered;
                },
              }),
            }),
          };
        },
        update: () => ({ in: async () => ({ error: null }) }),
      }),
    };

    const summary = await syncPendingRegistrationPaymentsFromZeffy(supabase as never, {}, {
      matchPayment: vi.fn(),
      finalize: vi.fn(),
      sendConfirmation: vi.fn(),
      resolvePaymentScope: vi.fn(),
    });
    expect(summary.errors[0]?.message).toMatch(/apply-payment-schema-gap/i);
  });

  it('rethrows unexpected confirmation retry query errors', async () => {
    const supabase = {
      from: () => ({
        select: (columns: string) => {
          if (columns === 'id') {
            return {
              eq: () => ({
                is: () => ({
                  order: () => ({
                    limit: async () => ({ data: null, error: { message: 'connection reset' } }),
                  }),
                }),
              }),
            };
          }
          return {
            eq: () => ({
              or: () => ({
                or: () => {
                  const ordered = { order: () => ordered, limit: async () => ({ data: [], error: null }) };
                  return ordered;
                },
              }),
            }),
          };
        },
        update: () => ({ in: async () => ({ error: null }) }),
      }),
    };

    await expect(
      syncPendingRegistrationPaymentsFromZeffy(supabase as never, {}, {
        matchPayment: vi.fn(),
        finalize: vi.fn(),
        sendConfirmation: vi.fn(),
        resolvePaymentScope: vi.fn(),
      }),
    ).rejects.toThrow(/connection reset/);
  });

  it('rethrows non-Error confirmation retry failures', async () => {
    const supabase = {
      from: () => ({
        select: (columns: string) => {
          if (columns === 'id') {
            throw 'confirmation-query-boom';
          }
          return {
            eq: () => ({
              or: () => ({
                or: () => {
                  const ordered = { order: () => ordered, limit: async () => ({ data: [], error: null }) };
                  return ordered;
                },
              }),
            }),
          };
        },
        update: () => ({ in: async () => ({ error: null }) }),
      }),
    };

    await expect(
      syncPendingRegistrationPaymentsFromZeffy(supabase as never, {}, {
        matchPayment: vi.fn(),
        finalize: vi.fn(),
        sendConfirmation: vi.fn(),
        resolvePaymentScope: vi.fn(),
      }),
    ).rejects.toBe('confirmation-query-boom');
  });

  it('counts rejected rows and sync exceptions', async () => {
    const rejected = pendingRow({ id: 'rej-1' });
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            or: () => ({
              or: () => {
                const ordered = {
                  order: () => ordered,
                  limit: async () => ({ data: [rejected], error: null }),
                };
                return ordered;
              },
            }),
            is: () => ({
              order: () => ({ limit: async () => ({ data: [], error: null }) }),
            }),
          }),
        }),
        update: () => ({ in: async () => ({ error: null }) }),
      }),
    };

    const summary = await syncPendingRegistrationPaymentsFromZeffy(
      supabase as never,
      {},
      {
        matchPayment: vi.fn(async () => ({
          paymentId: 'pay_1',
          status: 'succeeded',
          amountCents: 10_000,
          currencyLower: 'usd',
        })),
        finalize: vi.fn(async () => ({ outcome: 'rejected', reason: 'amount_mismatch' })),
        sendConfirmation: vi.fn(),
        resolvePaymentScope: async () => ({ createdGteUnix: 1 }),
      },
    );
    expect(summary.rejected).toBe(1);

    const upstream = pendingRow({ id: 'err-upstream' });
    const upstreamSummary = await syncPendingRegistrationPaymentsFromZeffy(
      {
        from: () => ({
          select: () => ({
            eq: () => ({
              or: () => ({
                or: () => {
                  const ordered = {
                    order: () => ordered,
                    limit: async () => ({ data: [upstream], error: null }),
                  };
                  return ordered;
                },
              }),
              is: () => ({
                order: () => ({ limit: async () => ({ data: [], error: null }) }),
              }),
            }),
          }),
          update: () => ({ in: async () => ({ error: null }) }),
        }),
      } as never,
      {},
      {
        matchPayment: vi.fn(async () => ({ error: 'upstream unavailable' })),
        finalize: vi.fn(),
        sendConfirmation: vi.fn(),
        resolvePaymentScope: async () => ({ createdGteUnix: 1 }),
      },
    );
    expect(upstreamSummary.errors[0]?.message).toBe('upstream unavailable');
  });

  it('throws when the confirmation retry query fails', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            or: () => ({
              or: () => {
                const ordered = { order: () => ordered, limit: async () => ({ data: [], error: null }) };
                return ordered;
              },
            }),
            is: () => ({
              order: () => ({
                limit: async () => ({ data: null, error: { message: 'confirmation query failed' } }),
              }),
            }),
          }),
        }),
        update: () => ({ in: async () => ({ error: null }) }),
      }),
    };
    await expect(syncPendingRegistrationPaymentsFromZeffy(supabase as never, {})).rejects.toThrow(
      /confirmation query failed/,
    );

    const throwing = {
      from: () => ({
        select: () => ({
          eq: () => ({
            or: () => ({
              or: () => {
                const ordered = {
                  order: () => ordered,
                  limit: async () => ({ data: [pendingRow({ id: 'err-1' })], error: null }),
                };
                return ordered;
              },
            }),
            is: () => ({
              order: () => ({ limit: async () => ({ data: [], error: null }) }),
            }),
          }),
        }),
        update: () => ({ in: async () => ({ error: null }) }),
      }),
    };
    const summaryError = await syncPendingRegistrationPaymentsFromZeffy(
      throwing as never,
      {},
      {
        matchPayment: vi.fn(async () => {
          throw new Error('sync blew up');
        }),
        finalize: vi.fn(),
        sendConfirmation: vi.fn(),
        resolvePaymentScope: async () => ({ createdGteUnix: 1 }),
      },
    );
    expect(summaryError.errors[0]?.message).toBe('sync blew up');

    const markFailure = {
      from: () => ({
        select: () => ({
          eq: () => ({
            or: () => ({
              or: () => {
                const ordered = {
                  order: () => ordered,
                  limit: async () => ({ data: [pendingRow()], error: null }),
                };
                return ordered;
              },
            }),
            is: () => ({
              order: () => ({ limit: async () => ({ data: [], error: null }) }),
            }),
          }),
        }),
        update: () => ({ in: async () => ({ error: { message: 'mark failed' } }) }),
      }),
    };
    await expect(syncPendingRegistrationPaymentsFromZeffy(markFailure as never, {})).rejects.toThrow(/mark failed/);
  });

  it('records confirmation retry exceptions', async () => {
    const supabase = {
      from: () => ({
        select: (columns: string) => {
          if (columns === 'id') {
            return {
              eq: () => ({
                is: () => ({
                  order: () => ({
                    limit: async () => ({ data: [{ id: 'retry-throw' }], error: null }),
                  }),
                }),
              }),
            };
          }
          return {
            eq: () => ({
              or: () => ({
                or: () => {
                  const ordered = { order: () => ordered, limit: async () => ({ data: [], error: null }) };
                  return ordered;
                },
              }),
            }),
          };
        },
      }),
    };
    const summary = await syncPendingRegistrationPaymentsFromZeffy(
      supabase as never,
      {},
      {
        matchPayment: vi.fn(),
        finalize: vi.fn(),
        sendConfirmation: vi.fn(async () => {
          throw new Error('smtp down');
        }),
        resolvePaymentScope: vi.fn(),
      },
    );
    expect(summary.errors[0]?.message).toBe('smtp down');
  });
});
