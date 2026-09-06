'use strict';
const MODE = process.env.ZZ_RULE || '';
exports.active = !!MODE;
exports.check = () => [];
/** true when the profile only ever widens from row 0 down to `lo` */
function monotone(p, lo) { for (let i = 1; i <= lo; i++) if (p[i] < p[i - 1]) return false; return true; }
exports.roofline = (p, lo55) => {
  if (MODE === 'off') return lo55;
  if (MODE === 'mono') return monotone(p, lo55) ? 0 : lo55;
  return lo55;
};
