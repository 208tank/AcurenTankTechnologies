export type TankType = 'ifr' | 'efr' | 'insulated';
export type Section = 'floor' | 'shell' | 'roof' | 'floating' | 'seal';
export type Technology = {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  detects: string;
  howItWorks: string;
  advantages: string;
  limitations: string;
  sections: Section[];
  tankTypes: TankType[];
  suggested: boolean;
  imageUrl: string;
  notes: string;
};
export const tankTypes: { id: TankType; name: string; short: string; description: string }[] = [
  {
    id: 'ifr',
    name: 'Internal floating roof',
    short: 'IFR',
    description: 'Fixed cone roof · steel pan & pontoons',
  },
  {
    id: 'efr',
    name: 'External floating roof',
    short: 'EFR',
    description: 'Open top · pontoon deck & rim seal',
  },
  {
    id: 'insulated',
    name: 'Insulated tank',
    short: 'INS',
    description: 'Insulated shell · fixed roof & IFR',
  },
];
export const sections: { id: Section; name: string; description: string }[] = [
  { id: 'floor', name: 'Floor', description: 'Bottom plates, annular ring & foundation' },
  { id: 'shell', name: 'Shell', description: 'Plate courses, welds & shell geometry' },
  { id: 'roof', name: 'Fixed roof', description: 'Cone roof, structure & roof plates' },
  { id: 'floating', name: 'Floating roof', description: 'Steel pan, pontoons & appurtenances' },
  { id: 'seal', name: 'Rim seal', description: 'Seal integrity, gaps & vapor control' },
];
const all: TankType[] = ['ifr', 'efr', 'insulated'];
function item(
  id: string,
  name: string,
  subtitle: string,
  sections: Section[],
  description: string,
  detects: string,
  howItWorks: string,
  advantages: string,
  limitations: string,
  suggested = false,
  types: TankType[] = all,
): Technology {
  return {
    id,
    name,
    subtitle,
    sections,
    description,
    detects,
    howItWorks,
    advantages,
    limitations,
    suggested,
    tankTypes: types,
    imageUrl: '',
    notes: '',
  };
}
export const defaults: Technology[] = [
  item(
    'mfl',
    'MFL',
    'Magnetic flux leakage',
    ['floor'],
    'Rapid screening of ferromagnetic floor plates for corrosion on the product side and soil side.',
    'Localized pitting and general metal loss in floor plates.',
    'A magnetic yoke saturates the plate. Sensors record flux leakage where metal loss disturbs the magnetic field.',
    'Fast, broad-area coverage; maps indications for targeted UT prove-up.',
    'Not a direct remaining-thickness measurement. Coatings, plate thickness, welds and edge dead zones affect sensitivity. Confirm relevant indications with calibrated UT.',
  ),
  item(
    'floor-ut',
    'Conventional UT',
    'Ultrasonic thickness measurement',
    ['floor'],
    'Measures remaining thickness at selected locations and verifies floor-scanning indications.',
    'Local thinning and pitting at the measured position.',
    'A calibrated pulse-echo probe measures sound transit time through the steel.',
    'Quantitative thickness readings; useful for MFL prove-up and baseline measurements.',
    'Spot readings can miss pits between locations. Surface preparation, coupling, calibration and coverage planning matter.',
  ),
  item(
    'floor-vt',
    'VT',
    'Visual testing',
    ['floor'],
    'Close visual examination of exposed floor plates, welds, coatings and repairs.',
    'Visible corrosion, distortion, coating damage, weld anomalies and leakage evidence.',
    'Qualified personnel examine prepared surfaces directly or with remote optical aids.',
    'Immediate, versatile and useful for directing follow-up NDE.',
    'Surface-only examination; hidden underside damage cannot be quantified. Internal access needs isolation and confined-space controls.',
  ),
  item(
    'floor-laser',
    'Laser scanning',
    'Edge settlement & floor bulges',
    ['floor'],
    'Maps floor elevations to document edge settlement, local bulges and depressions.',
    'Geometric deformation and settlement patterns, not metal loss.',
    'Registered laser point clouds and elevation profiles are compared to a reference geometry.',
    'Dense, repeatable geometry data with intuitive 3D reporting.',
    'Requires line of sight, stable survey control and correction for design slope. Evaluate settlement using applicable API 653 criteria; scanning alone does not establish acceptance.',
  ),
  item(
    'slofec',
    'SLOFEC / eddy current',
    'Electromagnetic floor screening',
    ['floor'],
    'Electromagnetic screening of floor plates with qualified equipment and procedures.',
    'Responses associated with corrosion and localized metal loss.',
    'SLOFEC combines magnetic bias with eddy-current sensing to map material-loss responses.',
    'Broad-area screening; some systems tolerate coatings within qualified limits.',
    'Performance depends on material, coating and equipment. Verify indications by UT; do not assume direct thickness sizing.',
    true,
  ),
  item(
    'robot',
    'Robotic in-service inspection',
    'Remote floor assessment',
    ['floor'],
    'Deploys a sensor-equipped robot to inspect a tank floor without routine personnel entry.',
    'Thickness loss or visible anomalies, depending on the sensor payload.',
    'A remotely operated platform navigates the bottom using UT, electromagnetic or visual sensors.',
    'May reduce shutdown and entry needs when product and operating conditions permit.',
    'Hazardous-area suitability, product compatibility, sludge, access and localization constrain coverage. Not automatically a substitute for a required internal inspection.',
    true,
  ),
  item(
    'ae',
    'Acoustic emission',
    'In-service floor screening',
    ['floor'],
    'Screens a liquid-filled tank for active acoustic sources to help prioritize follow-up.',
    'Acoustic activity potentially associated with corrosion or leakage.',
    'An array of externally mounted sensors records and locates stress-wave events under controlled conditions.',
    'Large-area, non-intrusive screening with minimal entry requirements.',
    'Noise, operating conditions and source classification affect results. Does not measure remaining thickness or locate every inactive defect.',
    true,
  ),
  item(
    'vacuum',
    'Vacuum box testing',
    'Floor weld leak testing',
    ['floor'],
    'Checks accessible floor welds for through-leak paths.',
    'Through-wall leakage at tested welds.',
    'A sealed vacuum box creates a pressure differential over a wetted test surface; bubbles indicate leakage.',
    'Local, direct leak indication on accessible welds.',
    'Requires a suitable seal and test procedure. Not a corrosion-sizing method or a guarantee of untested weld integrity.',
    true,
  ),
  item(
    'helium',
    'Helium leak testing',
    'Tracer-gas leak detection',
    ['floor', 'floating'],
    'Sensitive leak examination of suitably arranged plates, welds or pontoon compartments.',
    'Leak paths that allow tracer gas to pass.',
    'A controlled tracer-gas arrangement and a calibrated detector identify helium leakage.',
    'Sensitive to small leaks when the setup is suitable.',
    'Gas containment, background and test pressure require control. Does not establish plate strength or remaining thickness.',
    true,
  ),
  item(
    'settlement',
    'Settlement survey',
    'Foundation & shell-edge elevations',
    ['floor'],
    'Measures differential settlement around the shell and relevant bottom areas.',
    'Differential foundation movement, edge settlement and settlement trends.',
    'Repeatable elevation readings are collected against stable benchmarks.',
    'Supports settlement assessment and comparison between inspection intervals.',
    'Datums and precision are critical. Correct for design slope and refer unusual results to a competent tank engineer.',
    true,
  ),
  item(
    'chime',
    'Chime / annular UT',
    'Shell-to-bottom junction',
    ['floor'],
    'Targeted thickness examination of accessible annular and chime regions.',
    'Accessible local thinning near the shell-to-bottom junction.',
    'Calibrated UT readings or qualified scans assess accessible plate material.',
    'Targets a critical region that broad floor scanning may not cover.',
    'Complex geometry, sealants and restricted access limit coverage. External chime readings do not prove the entire internal annular plate condition.',
    true,
  ),
  item(
    'aut',
    'AUT',
    'Automated ultrasonic testing',
    ['shell'],
    'Mechanized ultrasonic scanning maps shell thickness with position-encoded data.',
    'General corrosion and localized wall loss within the qualified scan coverage.',
    'A scanner moves calibrated probes along the shell and records thickness or ultrasonic responses.',
    'Repeatable corrosion maps and greater coverage than isolated manual readings.',
    'Coupling, surface condition, scan spacing and access control sensitivity. Weld examination needs its own appropriate configuration.',
  ),
  item(
    'shell-laser',
    'Laser scanning',
    'Peaking, banding & bulges',
    ['shell'],
    'Documents local and overall shell geometry using dense survey data.',
    'Peaking at vertical welds, banding at horizontal welds, bulges and shape deviations.',
    'Point clouds are compared with fitted cylinders and local profile references.',
    'Clear deformation visualization and repeatable dimensional records.',
    'Does not detect hidden corrosion or measure crack depth. Registration accuracy, occlusion and applicable acceptance criteria govern interpretation.',
  ),
  item(
    'pec',
    'Pulsed Eddy Current',
    'Through-insulation screening',
    ['shell'],
    'Screens insulated carbon-steel shell areas for wall-loss indications without general insulation removal.',
    'Average wall loss over the probe footprint, including possible CUI-related thinning.',
    'A pulsed magnetic field induces eddy currents; their decay is related to the steel response.',
    'Can screen through suitable nonconductive insulation and compatible weather jacketing.',
    'Spatial averaging can miss small pits. Lift-off, jacketing, geometry and steel properties affect results. Confirm suspect areas by removing insulation and measuring with UT.',
    false,
    ['insulated'],
  ),
  item(
    'gwpa',
    'Guided Wave Phased Array',
    'Extended-area ultrasonic screening',
    ['shell'],
    'Uses guided ultrasonic waves and array processing to screen suitable shell regions from accessible positions.',
    'Responses associated with wall loss and discontinuities within qualified coverage.',
    'Ultrasonic modes propagate along the steel; controlled array excitation and reception support screening and localization.',
    'Can extend screening beyond direct probe access.',
    'Application-specific qualification is essential. Welds, attachments and mode behavior create limitations; this is not conventional local PAUT or direct thickness sizing. Confirm indications with local NDE.',
  ),
  item(
    'thermal',
    'Thermography',
    'Sludge interfaces & CUI screening',
    ['shell'],
    'Surveys surface-temperature patterns for possible sludge interfaces and insulation anomalies.',
    'Thermal contrasts potentially associated with contents, sludge or wet/damaged insulation.',
    'An infrared camera maps emitted thermal radiation under suitable operating conditions.',
    'Rapid, noncontact survey with accessible visual reporting.',
    'Indirect screening only. Weather, emissivity and thermal gradients affect results. Does not directly measure sludge volume, CUI or thickness; verify suspected CUI with targeted NDE.',
  ),
  item(
    'crawler',
    'Crawler UT',
    'Remote shell thickness mapping',
    ['shell'],
    'A remotely controlled crawler carries UT probes on accessible shell surfaces.',
    'Wall thinning and corrosion profiles along inspected paths.',
    'Magnetic or vacuum adhesion supports a crawler with encoded UT sensing.',
    'Reduces some work-at-height exposure; supports repeatable scan paths.',
    'Adhesion, obstructions, couplant supply and location accuracy affect coverage. Not every tank surface is suitable.',
    true,
  ),
  item(
    'weld',
    'PAUT / TOFD',
    'Weld examination',
    ['shell'],
    'Targeted ultrasonic weld examination for qualified inspection and repair scopes.',
    'Weld discontinuities; crack-height sizing where the method and procedure support it.',
    'PAUT steers and focuses ultrasonic beams; TOFD uses diffracted-wave arrival times.',
    'Recorded data and useful characterization of selected weld flaws.',
    'Requires qualified procedures, calibration and competent interpretation. Thin walls, access, geometry and TOFD near-surface dead zones restrict coverage.',
    true,
  ),
  item(
    'drone',
    'Drone visual inspection',
    'Remote exterior survey',
    ['shell', 'roof'],
    'Collects close-range imagery of external shell and fixed-roof surfaces.',
    'Visible corrosion, coating deterioration, damaged fittings and deformation.',
    'A remotely piloted platform carries cameras; other payloads require separate qualification.',
    'Rapid survey of elevated or difficult-to-reach surfaces.',
    'Flight restrictions, weather, hazardous areas and image scale matter. Ordinary imagery does not establish remaining wall thickness.',
    true,
  ),
  item(
    'mtpt',
    'MT / PT',
    'Surface weld examination',
    ['shell', 'floor', 'roof', 'floating'],
    'Examines prepared welds and suspect areas for surface discontinuities.',
    'MT: surface and near-surface flaws in ferromagnetic steel. PT: surface-breaking flaws.',
    'Magnetic particles reveal leakage fields; penetrant enters and develops surface-opening discontinuities.',
    'Sensitive local surface examination for follow-up and repairs.',
    'Preparation and material compatibility are essential. Not a volumetric examination or thickness measurement.',
    true,
  ),
  item(
    'roundness',
    'Roundness & verticality',
    'Global shell geometry survey',
    ['shell'],
    'Assesses out-of-roundness and departure from vertical using controlled dimensional surveys.',
    'Ovality, lean and global shell deformation.',
    'Laser scanning or survey measurements are compared to common datums and reference geometry.',
    'Useful baseline and trending for structural assessment.',
    'Does not establish corrosion or crack depth. Interpret geometry with applicable criteria and engineering review.',
    true,
  ),
  item(
    'cui',
    'Junction CUI inspection',
    'Insulation termination & tank base',
    ['shell', 'floor'],
    'Targets weatherproofing and corrosion risk near insulation terminations and the shell-floor junction.',
    'Damaged jacketing, water ingress, corrosion and accessible thinning.',
    'Visual checks and selective insulation removal are followed by suitable surface examination and UT.',
    'Directly examines vulnerable locations and validates screening indications.',
    'Localized removal cannot establish the condition of all concealed steel. Plan sampling and reinstatement carefully.',
    true,
    ['insulated'],
  ),
  item(
    'roof-vt',
    'Roof visual inspection',
    'Plates, supports & attachments',
    ['roof', 'floating'],
    'Examines accessible fixed or floating roof components, welds and appurtenances.',
    'Corrosion, deformation, cracking, damaged legs and structural deterioration.',
    'Direct or remote VT is planned around safe access and component geometry.',
    'Broad condition assessment that directs further examination.',
    'No access to concealed surfaces; never assume a roof is safe to walk on. Internal examination requires appropriate entry controls.',
    true,
  ),
  item(
    'roof-ut',
    'Roof / deck UT',
    'Plate thickness measurement',
    ['roof', 'floating'],
    'Measures remaining thickness in accessible roof, deck and pontoon plates.',
    'Local thinning and corrosion at measured locations.',
    'Calibrated pulse-echo UT or a qualified scan collects thickness readings.',
    'Quantitative data for evaluating plate condition.',
    'Coverage, thin-plate capability, coatings and surface condition matter. Spot readings do not rule out pitting elsewhere.',
    true,
  ),
  item(
    'pontoon',
    'Pontoon inspection',
    'Compartments & leak checks',
    ['floating'],
    'Evaluates buoyancy compartments for leakage and visible deterioration.',
    'Liquid ingress, failed welds, corrosion and compartment leakage.',
    'Visual inspection and approved leak-test arrangements assess compartments; UT supports plate assessment.',
    'Targets buoyancy-critical components of steel pontoon roofs.',
    'Test pressure must be strictly controlled by a qualified procedure. Leak-tightness alone does not demonstrate structural capacity; entry requires permits.',
    true,
  ),
  item(
    'seal',
    'Rim seal inspection',
    'Condition & gap measurement',
    ['seal'],
    'Examines IFR or EFR seals for continuity, deterioration and gaps.',
    'Damaged fabrics, worn shoes, failed attachments and excessive seal gaps.',
    'Visual checks and prescribed gap measurements assess the primary and, where fitted, secondary seal.',
    'Targets vapor-control components and mechanical fit.',
    'Use the relevant seal design and emissions requirements. Inspection of the seal does not establish roof plate integrity.',
    true,
  ),
  item(
    'gas',
    'Gas / LEL monitoring',
    'Atmospheric safety support',
    ['roof', 'floating', 'seal'],
    'Supports safe inspection of roof spaces, pontoons and potentially hazardous atmospheres.',
    'Only hazards covered by selected instruments, including flammables, oxygen deficiency and specified toxic gases.',
    'Calibrated and bump-tested instruments sample the planned locations with ongoing monitoring as required.',
    'Essential atmospheric information for permit-controlled work.',
    'Not a structural inspection technique. LEL alone does not address oxygen deficiency or toxic gases; follow isolation, ventilation, rescue and entry procedures.',
    true,
  ),
  item(
    'drain',
    'Roof drain inspection',
    'EFR drainage system',
    ['floating'],
    'Examines the external floating roof drainage path and its ability to discharge accumulated water.',
    'Blockages, leaks, damaged hoses or articulated joints and impaired drainage.',
    'Visual and functional examination is supplemented by appropriate leak or pressure testing.',
    'Addresses a key contributor to roof loading and loss of buoyancy.',
    'Hidden components need targeted tests. Follow the drain design and safe operating limits; functional flow alone does not prove leak-tightness.',
    true,
    ['efr'],
  ),
];
export function applicable(t: Technology, type: TankType, section?: Section): boolean {
  return !!t?.tankTypes?.includes?.(type) && (!section || !!t?.sections?.includes?.(section));
}
export function validateLibrary(value: unknown): Technology[] {
  if (!Array.isArray(value) || value.length > 500)
    throw new Error('Import must contain an array of up to 500 technologies.');
  const ids = new Set<string>();
  return value.map((t: unknown) => {
    if (!t || typeof t !== 'object') throw new Error('Invalid technology entry.');
    const v = t as Technology;
    const fields = [
      'id',
      'name',
      'subtitle',
      'description',
      'detects',
      'howItWorks',
      'advantages',
      'limitations',
      'imageUrl',
      'notes',
    ] as const;
    if (
      fields.some((f) => typeof v?.[f] !== 'string') ||
      !v?.name?.trim?.() ||
      !v?.id ||
      ids.has(v.id) ||
      typeof v?.suggested !== 'boolean'
    )
      throw new Error('Each entry needs all template fields and a unique ID.');
    if (
      !Array.isArray(v?.sections) ||
      !v.sections.length ||
      v.sections.some((s: Section) => !sections.some((x) => x.id === s)) ||
      !Array.isArray(v?.tankTypes) ||
      !v.tankTypes.length ||
      v.tankTypes.some((s: TankType) => !tankTypes.some((x) => x.id === s))
    )
      throw new Error('Each entry needs valid sections and tank types.');
    if (v?.imageUrl && !/^https?:\/\//i.test(v.imageUrl))
      throw new Error('Image URLs must begin with https:// or http://.');
    ids.add(v.id);
    return Object.fromEntries([
      ...fields.map((f) => [f, v[f]]),
      ['sections', v.sections],
      ['tankTypes', v.tankTypes],
      ['suggested', v.suggested],
    ]) as Technology;
  });
}
