// Postcode area prefix → place name, used to enrich SEO meta tags.
// Two-letter prefixes are checked before single-letter ones.
const AREA_NAMES = {
    AB: 'Aberdeen',           AL: 'St Albans',          BA: 'Bath',
    BB: 'Blackburn',          BD: 'Bradford',            BH: 'Bournemouth',
    BL: 'Bolton',             BN: 'Brighton',            BR: 'Bromley',
    BS: 'Bristol',            CA: 'Carlisle',            CB: 'Cambridge',
    CF: 'Cardiff',            CH: 'Chester',             CM: 'Chelmsford',
    CO: 'Colchester',         CR: 'Croydon',             CT: 'Canterbury',
    CV: 'Coventry',           CW: 'Crewe',               DA: 'Dartford',
    DD: 'Dundee',             DE: 'Derby',               DG: 'Dumfries',
    DH: 'Durham',             DL: 'Darlington',          DN: 'Doncaster',
    DT: 'Dorchester',         DY: 'Dudley',              EC: 'Central London',
    EH: 'Edinburgh',          EN: 'Enfield',             EX: 'Exeter',
    FK: 'Falkirk',            FY: 'Blackpool',           GL: 'Gloucester',
    GU: 'Guildford',          GY: 'Guernsey',            HA: 'Harrow',
    HD: 'Huddersfield',       HG: 'Harrogate',           HP: 'Hemel Hempstead',
    HR: 'Hereford',           HS: 'Outer Hebrides',      HU: 'Hull',
    HX: 'Halifax',            IG: 'Ilford',              IP: 'Ipswich',
    IV: 'Inverness',          JE: 'Jersey',              KA: 'Kilmarnock',
    KT: 'Kingston upon Thames', KW: 'Kirkwall',          KY: 'Kirkcaldy',
    LA: 'Lancaster',          LD: 'Llandrindod Wells',   LE: 'Leicester',
    LL: 'Llandudno',          LN: 'Lincoln',             LS: 'Leeds',
    LU: 'Luton',              ME: 'Medway',              MK: 'Milton Keynes',
    ML: 'Motherwell',         NE: 'Newcastle',           NG: 'Nottingham',
    NN: 'Northampton',        NP: 'Newport',             NR: 'Norwich',
    NW: 'Northwest London',   OL: 'Oldham',              OX: 'Oxford',
    PA: 'Paisley',            PE: 'Peterborough',        PH: 'Perth',
    PL: 'Plymouth',           PO: 'Portsmouth',          PR: 'Preston',
    RG: 'Reading',            RH: 'Redhill',             RM: 'Romford',
    SA: 'Swansea',            SE: 'Southeast London',    SG: 'Stevenage',
    SK: 'Stockport',          SL: 'Slough',              SM: 'Sutton',
    SN: 'Swindon',            SO: 'Southampton',         SP: 'Salisbury',
    SR: 'Sunderland',         SS: 'Southend-on-Sea',     ST: 'Stoke-on-Trent',
    SW: 'Southwest London',   SY: 'Shrewsbury',          TA: 'Taunton',
    TD: 'Galashiels',         TF: 'Telford',             TN: 'Tonbridge',
    TQ: 'Torquay',            TR: 'Truro',               TS: 'Teesside',
    TW: 'Twickenham',         UB: 'Southall',            WA: 'Warrington',
    WC: 'Central London',     WD: 'Watford',             WF: 'Wakefield',
    WN: 'Wigan',              WR: 'Worcester',           WS: 'Walsall',
    WV: 'Wolverhampton',      YO: 'York',                ZE: 'Lerwick',
    // Single-letter areas (checked last to avoid matching e.g. "B" before "BH")
    B: 'Birmingham',          E: 'East London',          G: 'Glasgow',
    L: 'Liverpool',           M: 'Manchester',           N: 'North London',
    S: 'Sheffield',           W: 'West London',
};

function getAreaName(code) {
    return AREA_NAMES[code.slice(0, 2)] || AREA_NAMES[code.slice(0, 1)] || null;
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (/^\/area\/[^/]+\/?$/.test(url.pathname)) {
            const code = url.pathname.split('/')[2].toUpperCase();

            const dnResp = await env.ASSETS.fetch(url.origin + '/data/district-names.json');
            const districtNames = dnResp.ok ? await dnResp.json() : {};
            const specificName = districtNames[code] || null;
            const areaName = getAreaName(code);

            // Prefer specific district name (e.g. "Lynmouth"), fall back to area name (e.g. "Exeter")
            const placeName = specificName || areaName;
            const label = specificName ? `${specificName} - ${code}` : (areaName ? `${code} (${areaName})` : code);

            const title = `${label} House Prices | UK House Price Heatmap`;
            const description = placeName
                ? `${placeName} (${code}) house prices from 1995 to 2025. Explore average and median prices, transaction volumes and price trends for the ${code} postcode district.`
                : `${code} house prices from 1995 to 2025. Explore average and median prices, transaction volumes and price trends for the ${code} postcode district.`;
            const canonical = `https://housepricedashboard.co.uk/area/${code}`;

            const response = await env.ASSETS.fetch(url.origin + '/area-page.html');

            return new HTMLRewriter()
                .on('title', {
                    element(el) { el.setInnerContent(title); },
                })
                .on('meta[name="description"]', {
                    element(el) { el.setAttribute('content', description); },
                })
                .on('meta[property="og:title"]', {
                    element(el) { el.setAttribute('content', title); },
                })
                .on('meta[property="og:description"]', {
                    element(el) { el.setAttribute('content', description); },
                })
                .on('meta[name="twitter:title"]', {
                    element(el) { el.setAttribute('content', title); },
                })
                .on('meta[name="twitter:description"]', {
                    element(el) { el.setAttribute('content', description); },
                })
                .on('base[href="/"]', {
                    element(el) {
                        el.after(`<link rel="canonical" href="${canonical}">`, { html: true });
                    },
                })
                .transform(response);
        }

        return env.ASSETS.fetch(request);
    },
};
