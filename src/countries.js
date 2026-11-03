// Country name (as Etsy prints it) → ISO 3166-1 alpha-2, which ShipGlobal requires.
// Every ISO country is covered: English names come from the browser (Intl.DisplayNames),
// plus the other spellings Etsy and buyers use. Keys are normalised (see norm()).
(function () {
  const CODES = (
    'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ ' +
    'BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM ' +
    'DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS ' +
    'GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN ' +
    'KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ ' +
    'MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM ' +
    'PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV ' +
    'SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI ' +
    'VN VU WF WS XK YE YT ZA ZM ZW'
  ).split(' ');

  const ALIASES = {
    'usa': 'US', 'united states of america': 'US', 'america': 'US',
    'uk': 'GB', 'great britain': 'GB', 'britain': 'GB', 'england': 'GB', 'scotland': 'GB', 'wales': 'GB', 'northern ireland': 'GB',
    'uae': 'AE', 'czech republic': 'CZ', 'turkey': 'TR', 'turkiye': 'TR',
    'korea, republic of': 'KR', 'republic of korea': 'KR', 'korea': 'KR', 'south korea': 'KR',
    'hong kong': 'HK', 'macau': 'MO', 'macao': 'MO', 'viet nam': 'VN', 'russian federation': 'RU',
    'the netherlands': 'NL', 'holland': 'NL', 'ivory coast': 'CI', "cote d'ivoire": 'CI',
    'eswatini': 'SZ', 'swaziland': 'SZ', 'burma': 'MM', 'macedonia': 'MK', 'north macedonia': 'MK',
    'vatican city': 'VA', 'holy see': 'VA', 'palestine': 'PS', 'taiwan, province of china': 'TW',
    'bosnia': 'BA', 'trinidad': 'TT', 'saint lucia': 'LC', 'st. lucia': 'LC', 'st lucia': 'LC',
    'congo, democratic republic of the': 'CD', 'democratic republic of the congo': 'CD', 'republic of the congo': 'CG',
    'timor-leste': 'TL', 'east timor': 'TL', 'cape verde': 'CV', 'micronesia': 'FM', 'laos': 'LA',
  };

  // Lowercase, drop accents and a leading "the"; "&" = "and", "St." = "Saint"; curly quotes
  // straightened; spaces collapsed.
  const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[’‘]/g, "'").replace(/&/g, ' and ').replace(/\bst\.?\s/g, 'saint ')
    .replace(/^the\s+/, '').replace(/\s+/g, ' ').trim();

  let display = null;
  try {
    display = new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    // Very old browser: aliases and codes still work.
  }
  const nameOf = (code) => {
    try { return display?.of(code) || code; } catch { return code; }
  };

  const byName = {};
  for (const code of CODES) {
    const name = nameOf(code);
    byName[norm(name)] = code;
    // "Hong Kong SAR China" → also "Hong Kong"; "Myanmar (Burma)" → also "Myanmar".
    byName[norm(name.replace(/\s*\(.*\)\s*/, '').replace(/\s+SAR China$/, ''))] = code;
  }
  for (const [alias, code] of Object.entries(ALIASES)) byName[norm(alias)] = code;

  // International calling code per country (without "+").
  const CALLING = Object.fromEntries((
    'AD376 AE971 AF93 AG1 AI1 AL355 AM374 AO244 AQ672 AR54 AS1 AT43 AU61 AW297 AX358 AZ994 ' +
    'BA387 BB1 BD880 BE32 BF226 BG359 BH973 BI257 BJ229 BL590 BM1 BN673 BO591 BQ599 BR55 BS1 ' +
    'BT975 BV47 BW267 BY375 BZ501 CA1 CC61 CD243 CF236 CG242 CH41 CI225 CK682 CL56 CM237 CN86 ' +
    'CO57 CR506 CU53 CV238 CW599 CX61 CY357 CZ420 DE49 DJ253 DK45 DM1 DO1 DZ213 EC593 EE372 ' +
    'EG20 EH212 ER291 ES34 ET251 FI358 FJ679 FK500 FM691 FO298 FR33 GA241 GB44 GD1 GE995 GF594 ' +
    'GG44 GH233 GI350 GL299 GM220 GN224 GP590 GQ240 GR30 GS500 GT502 GU1 GW245 GY592 HK852 ' +
    'HM672 HN504 HR385 HT509 HU36 ID62 IE353 IL972 IM44 IN91 IO246 IQ964 IR98 IS354 IT39 JE44 ' +
    'JM1 JO962 JP81 KE254 KG996 KH855 KI686 KM269 KN1 KP850 KR82 KW965 KY1 KZ7 LA856 LB961 LC1 ' +
    'LI423 LK94 LR231 LS266 LT370 LU352 LV371 LY218 MA212 MC377 MD373 ME382 MF590 MG261 MH692 ' +
    'MK389 ML223 MM95 MN976 MO853 MP1 MQ596 MR222 MS1 MT356 MU230 MV960 MW265 MX52 MY60 MZ258 ' +
    'NA264 NC687 NE227 NF672 NG234 NI505 NL31 NO47 NP977 NR674 NU683 NZ64 OM968 PA507 PE51 ' +
    'PF689 PG675 PH63 PK92 PL48 PM508 PN64 PR1 PS970 PT351 PW680 PY595 QA974 RE262 RO40 RS381 ' +
    'RU7 RW250 SA966 SB677 SC248 SD249 SE46 SG65 SH290 SI386 SJ47 SK421 SL232 SM378 SN221 SO252 ' +
    'SR597 SS211 ST239 SV503 SX1 SY963 SZ268 TC1 TD235 TF262 TG228 TH66 TJ992 TK690 TL670 TM993 ' +
    'TN216 TO676 TR90 TT1 TV688 TW886 TZ255 UA380 UG256 UM1 US1 UY598 UZ998 VA39 VC1 VE58 VG1 ' +
    'VI1 VN84 VU678 WF681 WS685 XK383 YE967 YT262 ZA27 ZM260 ZW263'
  ).split(' ').map((e) => [e.slice(0, 2), e.slice(2)]));

  // Countries whose national numbers keep their leading 0 after the country code.
  const KEEPS_ZERO = new Set(['IT', 'SM', 'VA']);

  // Put the country calling code on a phone number that doesn't have one, e.g.
  //   US "(248)555-1234" → "+1 (248)555-1234"   GB "07700 900123" → "+44 7700 900123"
  // Numbers already starting with "+" or "00", or already including the code, stay as they are.
  window.SG_formatPhone = function (phone, country) {
    const raw = (phone || '').trim();
    if (!raw || raw.startsWith('+')) return raw;
    if (/^00\d/.test(raw)) return `+${raw.slice(2).trim()}`;
    const cc = CALLING[(country || '').toUpperCase()];
    if (!cc) return raw;
    const digits = raw.replace(/\D/g, '');
    // Already includes the code (e.g. "1 248 555 1234", "44 7700 900123").
    if (digits.startsWith(cc) && digits.length >= 11 && digits.length - cc.length >= 8 && !/^\(?0/.test(raw)) {
      return `+${raw}`;
    }
    // Drop the national trunk 0, also when bracketed: "(02) 9374 4000" → "(2) 9374 4000".
    const national = KEEPS_ZERO.has(country) ? raw : raw.replace(/^(\(?)0+(?=\d)/, '$1');
    return `+${cc} ${national}`;
  };

  window.SG_COUNTRIES = byName;
  window.SG_COUNTRY_CODES = CODES;
  window.SG_countryName = nameOf;

  window.SG_countryToIso = function (name) {
    if (!name) return '';
    const clean = norm(name);
    if (/^[a-z]{2}$/.test(clean) && CODES.includes(clean.toUpperCase())) return clean.toUpperCase();
    return byName[clean] || '';
  };
})();
