const key = process.env.ZEFFY_API_KEY?.trim();
if (!key) {
  console.error('ZEFFY_API_KEY is not set');
  process.exit(1);
}

const all = [];
let cursor;
for (let page = 0; page < 10; page++) {
  const url = new URL('https://api.zeffy.com/api/v1/campaigns');
  if (cursor) url.searchParams.set('cursor', cursor);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('Zeffy API error', res.status, text.slice(0, 400));
    process.exit(1);
  }
  const json = JSON.parse(text);
  const items = Array.isArray(json.data) ? json.data : [];
  for (const c of items) {
    all.push({ id: c.id, title: c.title, type: c.type });
  }
  if (!json.has_more && !json.next_cursor) break;
  cursor = json.next_cursor;
}

console.log(JSON.stringify(all, null, 2));
