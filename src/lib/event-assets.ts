/** Official G-DNA / community gallery (Cloudinary, account `dcjzmoarp`) */

const UPLOAD = 'https://res.cloudinary.com/dcjzmoarp/image/upload';

/** Auto format/quality + sensible max width for hero cards (Next/Image still optimizes further) */
function cloudinaryPublicId(transform: string, publicIdPath: string) {
  return `${UPLOAD}/${transform}/${publicIdPath}`;
}

const GALA_GHANA_2024 = 'GDNA-FUNDRAISING-GALA-GHANA-2024';
const OPT = 'f_auto,q_auto:good,w_2400';

export const GALA_IMAGES = {
  galaGroupFormal: cloudinaryPublicId(OPT, `v1728993273/${GALA_GHANA_2024}/_M2_0928_w128rk.jpg`),
  galaCrowdProfessional: cloudinaryPublicId(OPT, `v1728993276/${GALA_GHANA_2024}/_M2_0934_emitz2.jpg`),
} as const;

/** Register page: hero uses the wider crowd scene; spotlight uses the formal group portrait */
export const REGISTER_PAGE_IMAGES = {
  hero: GALA_IMAGES.galaCrowdProfessional,
  spotlight: GALA_IMAGES.galaGroupFormal,
} as const;
