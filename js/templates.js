/* Pre-loaded snippet library. Each entry: { id, category, title, mode, description, code }.
 * Modes match the editor: 'formula' (Custom Component), 'tpled' (Template Editor value field), 'inp' (objects.inp).
 * Numeric limits, clearances and gauge tables are worked examples; replace them with your company or project standard.
 * Attribute names are common Template Editor names; confirm them in your Tekla version's attribute browser. */
const L = (...lines) => lines.join('\n');
const ind = s => s.split('\n').map(l => '  ' + l).join('\n');
const gv = n => `double(GetValue("${n}"))`;

const STEEL = 'Steel detailing';
const MBS = 'Metal building systems';
const REBAR = 'Rebar and BBS';
const INP = 'objects.inp';
export const CATEGORIES = [STEEL, MBS, REBAR, INP];

/* Nested if chain that prints only the BBS dimensions that exist, A through G. */
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const dimTxt = k => `string(int(${gv('DIM_' + k)}))`;
const dimChain = n => (n === 0 ? dimTxt('A')
  : L(`if (${gv('DIM_' + LETTERS[n])} > 0) then`, ind(LETTERS.slice(0, n + 1).map(dimTxt).join(' + " x " + ')), 'else', ind(dimChain(n - 1)), 'endif'));

export const TEMPLATES = [
  /* ---------- Steel detailing ---------- */
  {
    id: 'steel-bolt-edge', category: STEEL, title: 'Bolt edge distance check', mode: 'formula',
    description: 'P1 = bolt diameter, P2 = proposed edge distance (mm). Returns the proposed edge, or the minimum of 1.5 x diameter rounded up to 5 mm if it is too small. Change 1.5 to your code factor.',
    code: L('if (P2 < 1.5 * P1) then', '  ceil(1.5 * P1 / 5) * 5', 'else', '  P2', 'endif')
  },
  {
    id: 'steel-wrench-clearance', category: STEEL, title: 'Wrench clearance by bolt diameter', mode: 'formula',
    description: 'P1 = bolt diameter (mm). Returns the clearance around the bolt head in mm from a four-step table. Edit the table to match your fabricator standard.',
    code: L('if (P1 <= 16) then', '  35', 'else', '  if (P1 <= 20) then', '    40', '  else', '    if (P1 <= 24) then', '      45', '    else', '      55', '    endif', '  endif', 'endif')
  },
  {
    id: 'steel-thickness-label', category: STEEL, title: 'Flange and web thickness label', mode: 'tpled',
    description: 'Formats the profile flange and web thickness to one decimal, for example "tf 12 / tw 8".',
    code: `"tf " + string(round(${gv('PROFILE.FLANGE_THICKNESS_1')}, 1)) + " / tw " + string(round(${gv('PROFILE.WEB_THICKNESS')}, 1))`
  },
  {
    id: 'steel-thickness-trim', category: STEEL, title: 'Flange thickness without trailing zeros', mode: 'tpled',
    description: 'Prints 12 for a whole-number thickness and 12.5 for a fractional one.',
    code: L(`if (${gv('PROFILE.FLANGE_THICKNESS_1')} == int(${gv('PROFILE.FLANGE_THICKNESS_1')})) then`,
      `  string(int(${gv('PROFILE.FLANGE_THICKNESS_1')}))`, 'else', `  string(round(${gv('PROFILE.FLANGE_THICKNESS_1')}, 1))`, 'endif')
  },
  {
    id: 'steel-weight-net', category: STEEL, title: 'Net weight rounded up to 0.1 kg', mode: 'tpled',
    description: 'Rounds the assembly net weight up to the next 0.1 kg for shipping lists.',
    code: `ceil(${gv('WEIGHT_NET')} * 10) / 10`
  },
  {
    id: 'steel-weight-waste', category: STEEL, title: 'Gross to net waste percentage', mode: 'tpled',
    description: 'Shows how much heavier the gross weight is than the net weight, as a percentage to one decimal. Returns 0 when the net weight is 0.',
    code: L(`if (${gv('WEIGHT_NET')} > 0) then`, `  round((${gv('WEIGHT')} - ${gv('WEIGHT_NET')}) / ${gv('WEIGHT_NET')} * 100, 1)`, 'else', '  0', 'endif')
  },
  {
    id: 'steel-paint-area', category: STEEL, title: 'Paint surface area in square metres', mode: 'tpled',
    description: 'Converts the part AREA attribute from mm2 to m2 and rounds to two decimals. Assumes your environment reports AREA in mm2.',
    code: `string(round(${gv('AREA')} / 1000000, 2)) + " m2"`
  },
  {
    id: 'steel-paint-litres', category: STEEL, title: 'Paint volume in litres', mode: 'formula',
    description: 'P1 = area (m2), P2 = dry film thickness (microns), P3 = volume solids (%). Theoretical litres = area x DFT / (10 x solids), before loss factor.',
    code: L('if (P3 > 0) then', '  P1 * P2 / (10 * P3)', 'else', '  0', 'endif')
  },

  /* ---------- Metal building systems ---------- */
  {
    id: 'mbs-purlin-gauge', category: MBS, title: 'Z-purlin gauge by span', mode: 'formula',
    description: 'P1 = purlin span (mm). Returns the base metal thickness in mm from a span slide-rule: up to 6 m, 8 m and 10 m, otherwise the heaviest gauge. Replace the limits with your catalogue.',
    code: L('if (P1 <= 6000) then', '  1.6', 'else', '  if (P1 <= 8000) then', '    2', '  else', '    if (P1 <= 10000) then', '      2.5', '    else', '      3', '    endif', '  endif', 'endif')
  },
  {
    id: 'mbs-purlin-lap', category: MBS, title: 'Z-purlin lap length', mode: 'formula',
    description: 'P1 = purlin span (mm). Lap = 10% of span rounded up to 50 mm, limited to 600 mm minimum and 1500 mm maximum.',
    code: L('if (P1 * 0.1 < 600) then', '  600', 'else', '  if (P1 * 0.1 > 1500) then', '    1500', '  else', '    ceil(P1 * 0.1 / 50) * 50', '  endif', 'endif')
  },
  {
    id: 'mbs-girt-gauge', category: MBS, title: 'C-girt gauge by bay width', mode: 'formula',
    description: 'P1 = bay width (mm). Returns the girt thickness in mm: 1.6 up to 6 m, 2.0 up to 7.5 m, otherwise 2.5.',
    code: L('if (P1 <= 6000) then', '  1.6', 'else', '  if (P1 <= 7500) then', '    2', '  else', '    2.5', '  endif', 'endif')
  },
  {
    id: 'mbs-web-depth', category: MBS, title: 'Tapered web depth at a position', mode: 'formula',
    description: 'P1 = depth at start, P2 = depth at end, P3 = member length, P4 = distance from start (all mm). Linear interpolation rounded to the nearest millimetre.',
    code: L('if (P3 > 0) then', '  round(P1 + (P2 - P1) * P4 / P3)', 'else', '  P1', 'endif')
  },
  {
    id: 'mbs-taper-angle', category: MBS, title: 'Tapered rafter web slope angle', mode: 'formula',
    description: 'P1 = depth at start, P2 = depth at end, P3 = member length (mm). Returns the web slope in degrees, rounded to two decimals.',
    code: L('if (P3 > 0) then', '  round(atan((P2 - P1) / P3), 2)', 'else', '  0', 'endif')
  },

  /* ---------- Rebar and BBS ---------- */
  {
    id: 'rebar-bbs-length', category: REBAR, title: 'BS 8666 cut length by shape code', mode: 'formula',
    description: 'P1 = shape code (0, 11, 12 or 21), P2 to P4 = dimensions A, B, C, P5 = bar diameter d, P6 = inner bend radius r (mm). Applies L = A + B - 0.5r - d for 11, A + B + C - r - 2d for 12 and A + B + C - 1.5r - 2d for 21. Check the formulas against the edition of the standard you detail to.',
    code: L('if (P1 == 0) then', '  P2', 'else', '  if (P1 == 11) then', '    P2 + P3 - 0.5 * P6 - P5', '  else', '    if (P1 == 12) then', '      P2 + P3 + P4 - P6 - 2 * P5', '    else',
      '      if (P1 == 21) then', '        P2 + P3 + P4 - 1.5 * P6 - 2 * P5', '      else', '        0', '      endif', '    endif', '  endif', 'endif')
  },
  {
    id: 'rebar-bbs-dims', category: REBAR, title: 'BBS dimension string A to G', mode: 'tpled',
    description: 'Prints the bar dimensions that are greater than 0 as "A x B x C", from DIM_A through DIM_G.',
    code: dimChain(6)
  },
  {
    id: 'rebar-hook-total', category: REBAR, title: 'Total hook allowance', mode: 'tpled',
    description: 'Adds HOOK_START_LENGTH and HOOK_END_LENGTH for a quick check against the schedule.',
    code: `${gv('HOOK_START_LENGTH')} + ${gv('HOOK_END_LENGTH')}`
  },
  {
    id: 'rebar-hook-as3600', category: REBAR, title: 'Standard hook extension, AS 3600', mode: 'formula',
    description: 'P1 = hook angle (90 or 180), P2 = bar diameter (mm). 180 degree hook: 4d but not less than 70 mm. 90 degree hook: 12d. Returns 0 for other angles.',
    code: L('if (P1 == 180) then', '  if (4 * P2 < 70) then', '    70', '  else', '    4 * P2', '  endif', 'else', '  if (P1 == 90) then', '    12 * P2', '  else', '    0', '  endif', 'endif')
  },
  {
    id: 'rebar-hook-aci', category: REBAR, title: 'Standard hook extension, ACI 318', mode: 'formula',
    description: 'P1 = hook angle (90, 135 or 180), P2 = bar diameter (mm). 90 degree: 12d. 135 degree stirrup: 6d, minimum 75 mm. 180 degree: 4d, minimum 65 mm. Returns 0 for other angles.',
    code: L('if (P1 == 90) then', '  12 * P2', 'else', '  if (P1 == 135) then', '    if (6 * P2 < 75) then', '      75', '    else', '      6 * P2', '    endif', '  else', '    if (P1 == 180) then', '      if (4 * P2 < 65) then', '        65', '      else',
      '        4 * P2', '      endif', '    else', '      0', '    endif', '  endif', 'endif')
  },
  {
    id: 'rebar-lap-multiplier', category: REBAR, title: 'Tension lap length from concrete grade', mode: 'formula',
    description: 'P1 = bar diameter (mm), P2 = concrete strength f\'c (MPa). Preliminary rule of thumb: 50d up to 25 MPa, 45d up to 32 MPa, 40d up to 40 MPa, 36d above, rounded up to 50 mm. Confirm against the structural notes.',
    code: L('if (P2 <= 25) then', '  ceil(50 * P1 / 50) * 50', 'else', '  if (P2 <= 32) then', '    ceil(45 * P1 / 50) * 50', '  else', '    if (P2 <= 40) then', '      ceil(40 * P1 / 50) * 50', '    else', '      ceil(36 * P1 / 50) * 50', '    endif', '  endif', 'endif')
  },
  {
    id: 'rebar-cover', category: REBAR, title: 'Concrete cover by exposure class', mode: 'formula',
    description: 'P1 = exposure class number 1 to 4. Returns 20, 30, 40 or 50 mm cover from a simple project schedule; any other value returns 50 mm.',
    code: L('if (P1 == 1) then', '  20', 'else', '  if (P1 == 2) then', '    30', '  else', '    if (P1 == 3) then', '      40', '    else', '      50', '    endif', '  endif', 'endif')
  },
  {
    id: 'rebar-bar-label', category: REBAR, title: 'Bar size label with prefix', mode: 'tpled',
    description: 'Builds a label such as T16 from REBAR.SIZE. Change the prefix letter to N for AS/NZS bars.',
    code: '"T" + GetValue("REBAR.SIZE")'
  },
  {
    id: 'rebar-unit-mass', category: REBAR, title: 'Bar mass per metre', mode: 'formula',
    description: 'P1 = bar diameter (mm). Returns kg per metre using d squared / 162.2, rounded to three decimals.',
    code: 'round(P1 * P1 / 162.2, 3)'
  },
  {
    id: 'rebar-bar-mass', category: REBAR, title: 'Bar mass from diameter and length', mode: 'formula',
    description: 'P1 = bar diameter (mm), P2 = cut length (mm). Mass in kg using 7850 kg/m3 steel density.',
    code: 'round(3.14159265 * P1 * P1 / 4 * P2 * 7850 / 1000000000, 3)'
  },
  {
    id: 'rebar-tonnage', category: REBAR, title: 'MTO tonnage value field', mode: 'tpled',
    description: 'Converts the WEIGHT attribute from kg to tonnes with three decimals, for MTO summary lines.',
    code: `string(round(${gv('WEIGHT')} / 1000, 3)) + " t"`
  },

  /* ---------- objects.inp ---------- */
  {
    id: 'inp-fabrication-status', category: INP, title: 'Fabrication and erection status tab', mode: 'inp',
    description: 'One tab with IFA date, IFC date, shop checked, RFI hold and erection sequence. Follows the 11-parameter attribute layout used by this workbench validator; load it in a test environment first.',
    code: L('// Fabrication and erection status', 'tab_page("Fabrication and Erection")', 'modify(1)', '{',
      '  attribute("IFA_DATE", "IFA date", string, "%s", no, none, "0.0", "0.0", 0, 0, 120)',
      '  attribute("IFC_DATE", "IFC date", string, "%s", no, none, "0.0", "0.0", 0, 30, 120)',
      '  attribute("SHOP_CHECKED", "Shop checked (yes or no)", string, "%s", no, none, "0.0", "0.0", 0, 60, 120)',
      '  attribute("RFI_HOLD", "RFI hold number", string, "%s", no, none, "0.0", "0.0", 0, 90, 120)',
      '  attribute("ERECTION_SEQ", "Erection sequence", integer, "%d", no, none, "0", "0", 0, 120, 120)', '}')
  },
  {
    id: 'inp-rebar-pour', category: INP, title: 'Rebar pour, zone and coating tab', mode: 'inp',
    description: 'One tab with pour sequence, concrete zone, pour date, bar coating and coating thickness.',
    code: L('// Rebar pour sequence and coating', 'tab_page("Pour and Coating")', 'modify(1)', '{',
      '  attribute("POUR_SEQ", "Pour sequence", integer, "%d", no, none, "0", "0", 0, 0, 120)',
      '  attribute("CONC_ZONE", "Concrete zone", string, "%s", no, none, "0.0", "0.0", 0, 30, 120)',
      '  attribute("POUR_DATE", "Planned pour date", string, "%s", no, none, "0.0", "0.0", 0, 60, 120)',
      '  attribute("BAR_COATING", "Bar coating (plain, galvanised, epoxy)", string, "%s", no, none, "0.0", "0.0", 0, 90, 120)',
      '  attribute("COATING_UM", "Coating thickness (microns)", float, "%.1f", no, none, "0.0", "0.0", 0, 120, 120)', '}')
  }
];
