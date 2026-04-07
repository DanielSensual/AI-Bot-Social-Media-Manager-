/**
 * DanielSensual Group Registry
 *
 * Manages Facebook group targeting, category routing, cooldowns,
 * and posting state for the DanielSensual brand.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STATE_FILE = path.join(__dirname, '..', '.danielsensual-group-state.json');
const MIN_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours between posts to same group

// ─── Group Registry ─────────────────────────────────────────────

export const GROUPS = [
    // === Daniel's Own Group ===
    {
        name: 'Orlando Bachata Social Dancers',
        url: 'https://www.facebook.com/groups/BachataOrlando/',
        members: 2000,
        category: 'BACHATA_DANCE',
        owned: true,
        priority: 1,
        pillars: ['music', 'dance', 'event'],
    },

    // === Bachata & Dance Groups ===
    {
        name: 'International Bachata Festivals',
        url: 'https://www.facebook.com/groups/internationalbachatafestivals/',
        members: 26000,
        category: 'BACHATA_DANCE',
        priority: 2,
        pillars: ['music', 'dance', 'event'],
    },
    {
        name: 'Central Florida Dancers',
        url: 'https://www.facebook.com/groups/centralfloridadancers/',
        members: 5500,
        category: 'LATIN_DANCE',
        priority: 2,
        pillars: ['music', 'dance', 'event'],
    },
    {
        name: 'BACHATA LOVERS IN FLORIDA',
        url: 'https://www.facebook.com/groups/bachataloversinflorida/',
        members: 1600,
        category: 'BACHATA_DANCE',
        priority: 2,
        pillars: ['music', 'dance', 'event'],
    },
    {
        name: 'Central Florida Latin Dance',
        url: 'https://www.facebook.com/groups/centralfloridalatindance/',
        members: 1300,
        category: 'LATIN_DANCE',
        priority: 2,
        pillars: ['music', 'dance', 'event'],
    },
    {
        name: 'Bachata News',
        url: 'https://www.facebook.com/groups/bachatanews/',
        members: 13000,
        category: 'LATIN_MUSIC',
        priority: 2,
        pillars: ['music', 'dance', 'event'],
    },
    {
        name: 'Salsa and Bachata Nights!',
        url: 'https://www.facebook.com/groups/salsaandbachatanights/',
        members: 1900,
        category: 'LATIN_DANCE',
        priority: 3,
        pillars: ['dance', 'event'],
    },
    {
        name: 'Salsa & Bachata Nights South Florida',
        url: 'https://www.facebook.com/groups/salsabachatanightssouthflorida/',
        members: 5300,
        category: 'LATIN_DANCE',
        priority: 3,
        pillars: ['dance', 'event'],
    },
    {
        name: 'Dance Events in South Florida',
        url: 'https://www.facebook.com/groups/danceeventsinsouthflorida/',
        members: 3600,
        category: 'LATIN_DANCE',
        priority: 3,
        pillars: ['dance', 'event'],
    },
    {
        name: 'Dominican Bachata Videos',
        url: 'https://www.facebook.com/groups/dominicanbachatavideos/',
        members: 7200,
        category: 'LATIN_MUSIC',
        priority: 2,
        pillars: ['music', 'dance'],
    },

    // === Latino Community Groups (Events + Music only) ===
    {
        name: 'Boricuas en Orlando y Kissimmee and central florida',
        url: 'https://www.facebook.com/groups/boricuasenorlando/',
        members: 107000,
        category: 'LATINO_COMMUNITY',
        priority: 2,
        pillars: ['music', 'event'],
    },
    {
        name: 'latinos en kissimmee y orlando',
        url: 'https://www.facebook.com/groups/latinosenkissimmeeyorlando/',
        members: 73000,
        category: 'LATINO_COMMUNITY',
        priority: 2,
        pillars: ['music', 'event'],
    },
    {
        name: 'Latinos en Orlando & Kissimmee',
        url: 'https://www.facebook.com/groups/latinosenorlando/',
        members: 67000,
        category: 'LATINO_COMMUNITY',
        priority: 2,
        pillars: ['event'],
    },
    {
        name: 'Ayuda para Hispanos en Orlando',
        url: 'https://www.facebook.com/groups/ayudaparahispanosenorlando/',
        members: 57000,
        category: 'LATINO_COMMUNITY',
        priority: 3,
        pillars: ['event'],
    },
    {
        name: 'Comunidad Hispana en Orlando y sus alrededores',
        url: 'https://www.facebook.com/groups/comunidadhispanaenorlando/',
        members: 48000,
        category: 'LATINO_COMMUNITY',
        priority: 3,
        pillars: ['event'],
    },
    {
        name: 'Puertorriquenos en Orlando & Kissimmee',
        url: 'https://www.facebook.com/groups/puertorriquenosenorlando/',
        members: 37000,
        category: 'LATINO_COMMUNITY',
        priority: 3,
        pillars: ['event'],
    },

    // === Pending Approval ===
    {
        name: 'Tampa Salsa Bachata Scene',
        url: 'https://www.facebook.com/groups/tampasalsabachatascene/',
        members: 1600,
        category: 'LATIN_DANCE',
        priority: 3,
        pillars: ['dance', 'event'],
        pending: true,
    },
    {
        name: 'Tampa Loves Salsa Bachata',
        url: 'https://www.facebook.com/groups/tampalovessalsabachata/',
        members: 11000,
        category: 'LATIN_DANCE',
        priority: 3,
        pillars: ['dance', 'event'],
        pending: true,
    },
];

// === Groups to AVOID (competitors) ===
export const AVOID_GROUPS = [
    { name: 'BACHATA ORLANDO', reason: 'competitor' },
];

// ─── Video Share Groups (40+) ───────────────────────────────────
// These groups are specifically for sharing Daniel Sensual video/reel
// links. Sorted by priority — highest engagement potential first.

const SHARE_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
const AUTO_DISABLE_THRESHOLD = 3; // auto-disable after N consecutive failures

export const SHARE_GROUPS = [
    // ── Batch 1: Core Bachata & Dance (9 AM EST) ────────────────

    // Daniel's own group — always first
    { name: 'Orlando Bachata Social Dancers', url: 'https://www.facebook.com/groups/bachataorlando/', batch: 1, owned: true },

    // Verified bachata groups
    { name: 'International Bachata Festivals', url: 'https://www.facebook.com/groups/InternationalBachataFestivals/', batch: 1 },
    { name: 'Bachata News', url: 'https://www.facebook.com/groups/BachataNews/', batch: 1 },
    { name: 'Bachata News (2)', url: 'https://www.facebook.com/groups/360741504425892/', batch: 1 },
    { name: '🇩🇴Dominican Bachata Videos🇩🇴', url: 'https://www.facebook.com/groups/333512830085444/', batch: 1 },
    { name: 'Bachata Asia', url: 'https://www.facebook.com/groups/1648382815414149/', batch: 1 },
    { name: 'BACHATA URBANA', url: 'https://www.facebook.com/groups/188163091294456/', batch: 1 },
    { name: 'Bachata X', url: 'https://www.facebook.com/groups/bachatax/', batch: 1 },
    { name: 'Bachata in the UK', url: 'https://www.facebook.com/groups/230179800419487/', batch: 1 },
    { name: 'Bachateo en Europa', url: 'https://www.facebook.com/groups/395125475639743/', batch: 1 },
    { name: "Where's the Bachata Dancing?", url: 'https://www.facebook.com/groups/1029434378380692/', batch: 1 },
    { name: 'Bachata Sensual Xperience Events U.S', url: 'https://www.facebook.com/groups/1028100387222034/', batch: 1 },
    { name: 'Bachata Sensual Tampa Bay', url: 'https://www.facebook.com/groups/425435315990175/', batch: 1 },
    { name: 'BACHATA LOVERS IN FLORIDA', url: 'https://www.facebook.com/groups/335595419907653/', batch: 1 },
    { name: 'Bachata Sensual Dance Community', url: 'https://www.facebook.com/groups/bachatsensualdance/', batch: 1 },
    { name: 'Bachata Dance World', url: 'https://www.facebook.com/groups/bachatadanceworld/', batch: 1 },
    { name: 'Bachata Moderna', url: 'https://www.facebook.com/groups/bachatamoderna/', batch: 1 },
    { name: 'Bachata Fusion Worldwide', url: 'https://www.facebook.com/groups/bachatafusionworldwide/', batch: 1 },
    { name: 'Bachata Sensual World', url: 'https://www.facebook.com/groups/bachatansensualworld/', batch: 1 },
    { name: 'Bachata Dominicana', url: 'https://www.facebook.com/groups/bachatadominicana/', batch: 1 },

    // ── Batch 2: US City Dance Scenes (1 PM EST) ────────────────

    { name: 'Bay Area Bachata Dancing', url: 'https://www.facebook.com/groups/BayAreaBachataDancing/', batch: 2 },
    { name: 'BACHATA & SALSA IN BAY AREA', url: 'https://www.facebook.com/groups/316995965125643/', batch: 2 },
    { name: 'San Jose Bachata Nights', url: 'https://www.facebook.com/groups/sanjosebachatanights/', batch: 2 },
    { name: 'Sensual Bachata Chicago', url: 'https://www.facebook.com/groups/5371191912965156/', batch: 2 },
    { name: 'Bachata Social dancers in Chicago', url: 'https://www.facebook.com/groups/906991779337419/', batch: 2 },
    { name: 'Jacksonville Salsa & Bachata Scene', url: 'https://www.facebook.com/groups/jaxsalsabachatascene/', batch: 2 },
    { name: 'Connecticut Salsa, Mambo, and Bachata Scene', url: 'https://www.facebook.com/groups/ConnecticutSalsaandMamboScene/', batch: 2 },
    { name: 'Tampa Loves Salsa, Bachata & More', url: 'https://www.facebook.com/groups/121280981317539/', batch: 2 },
    { name: 'Salsa and Bachata Nights!', url: 'https://www.facebook.com/groups/288299318430221/', batch: 2 },
    { name: 'Salsa & Bachata Events', url: 'https://www.facebook.com/groups/534916443239278/', batch: 2 },
    { name: 'Dance Events in South Florida', url: 'https://www.facebook.com/groups/dancesouthflorida/', batch: 2 },
    { name: 'Salsa & Bachata Nights South Florida', url: 'https://www.facebook.com/groups/1975440802491980/', batch: 2 },
    { name: 'Central Florida Dancers', url: 'https://www.facebook.com/groups/353627944993366/', batch: 2 },
    { name: 'Central Florida Latin Dance', url: 'https://www.facebook.com/groups/260857457342351/', batch: 2 },
    { name: 'NYC Bachata Scene', url: 'https://www.facebook.com/groups/nycbachatascene/', batch: 2 },
    { name: 'NYC Salsa & Bachata', url: 'https://www.facebook.com/groups/nycsalsabachata/', batch: 2 },
    { name: 'Los Angeles Bachata Dancing', url: 'https://www.facebook.com/groups/labachatadancing/', batch: 2 },
    { name: 'LA Salsa & Bachata Scene', url: 'https://www.facebook.com/groups/lasalsabachata/', batch: 2 },
    { name: 'Houston Bachata & Salsa', url: 'https://www.facebook.com/groups/houstonbachatandsalsa/', batch: 2 },
    { name: 'Dallas Bachata & Salsa Scene', url: 'https://www.facebook.com/groups/dallasbachatascene/', batch: 2 },
    { name: 'Atlanta Latin Dance Scene', url: 'https://www.facebook.com/groups/atlantalatindance/', batch: 2 },
    { name: 'Miami Salsa & Bachata Scene', url: 'https://www.facebook.com/groups/miamisalsabachata/', batch: 2 },
    { name: 'Denver Latin Dance Community', url: 'https://www.facebook.com/groups/denverlatindance/', batch: 2 },
    { name: 'Phoenix Bachata & Salsa', url: 'https://www.facebook.com/groups/phoenixbachatascene/', batch: 2 },

    // ── Batch 3: International + Music + Content Promo (6 PM EST) ──

    { name: 'Salsa, Bachata, Kizomba & more Hamburg/Germany/Europe', url: 'https://www.facebook.com/groups/183346122270349/', batch: 3 },
    { name: 'London Latin Dance Events', url: 'https://www.facebook.com/groups/118710416185583/', batch: 3 },
    { name: 'Europe WOMAN Dance Fest', url: 'https://www.facebook.com/groups/180113296834114/', batch: 3 },
    { name: 'Washington DC-Baltimore Latin Dance Events', url: 'https://www.facebook.com/groups/207061397127018/', batch: 3 },
    { name: 'San Francisco Latin Dance Events', url: 'https://www.facebook.com/groups/183997259372109/', batch: 3 },
    { name: 'Salsa Orlando - LatinDanceCalendar.com', url: 'https://www.facebook.com/groups/1386797094934361/', batch: 3 },
    { name: 'UNIVERSO KIZOMBA', url: 'https://www.facebook.com/groups/1384948331659485/', batch: 3 },
    { name: 'Kizomba & UrbanKiz (IROKIZZ)', url: 'https://www.facebook.com/groups/729201684641919/', batch: 3 },
    { name: 'Casa de la Musica - I ❤ Salsa', url: 'https://www.facebook.com/groups/185609328567625/', batch: 3 },
    { name: 'Salsa Ladies Cup', url: 'https://www.facebook.com/groups/201598470898010/', batch: 3 },
    { name: 'Black Coalition of Dancers', url: 'https://www.facebook.com/groups/BlackCDance/', batch: 3 },
    { name: 'Independent Artists Radar', url: 'https://www.facebook.com/groups/603964381431915/', batch: 3 },
    { name: 'Promote your AI-generated music', url: 'https://www.facebook.com/groups/518000713909242/', batch: 3 },
    { name: 'Video Viral', url: 'https://www.facebook.com/groups/1078870673032630/', batch: 3 },
    { name: 'Bachata Paris', url: 'https://www.facebook.com/groups/bachataparis/', batch: 3 },
    { name: 'Bachata Madrid', url: 'https://www.facebook.com/groups/bachatamadrid/', batch: 3 },
    { name: 'Latin Dance London', url: 'https://www.facebook.com/groups/latindancelondon/', batch: 3 },
    { name: 'Salsa y Bachata Barcelona', url: 'https://www.facebook.com/groups/salsabachatabarcelona/', batch: 3 },
    { name: 'Bachata Italiana', url: 'https://www.facebook.com/groups/bachataitaliana/', batch: 3 },
    { name: 'Latin Dance Australia', url: 'https://www.facebook.com/groups/latindanceaustralia/', batch: 3 },
    { name: 'Bachata Canada', url: 'https://www.facebook.com/groups/bachatacanada/', batch: 3 },
    { name: 'Toronto Salsa & Bachata', url: 'https://www.facebook.com/groups/torontosalsabachata/', batch: 3 },
    { name: 'Kizomba World', url: 'https://www.facebook.com/groups/kizombaworld/', batch: 3 },
    { name: 'Zouk & Bachata Fusion', url: 'https://www.facebook.com/groups/zoukbachatafusion/', batch: 3 },

    // ── Batch 4: Late Night LATAM (11 PM EST = peak LATAM) ──────

    { name: 'Jax Latin Dance', url: 'https://www.facebook.com/groups/1520402664716806/', batch: 4 },
    { name: 'La Musica Latina Online Con bigraffy T.X.', url: 'https://www.facebook.com/groups/1444805165800431/', batch: 4 },
    { name: 'Bachata Mexicali y alrededores', url: 'https://www.facebook.com/groups/5574325759345486/', batch: 4 },
    { name: 'Bay Area Bachata Workshops', url: 'https://www.facebook.com/groups/379062195586330/', batch: 4 },
    { name: 'Beautiful Oasis for Latin Dance', url: 'https://www.facebook.com/groups/308235663483701/', batch: 4 },
    { name: 'Las Vegas Latin Music Association', url: 'https://www.facebook.com/groups/495852390445173/', batch: 4 },
    { name: 'Musica Latina by Chipoco', url: 'https://www.facebook.com/groups/1926469994241318/', batch: 4 },
    { name: 'MUSICA LATINA (LATIN JAZZ - JAZZ - CUBANA - SALSA)', url: 'https://www.facebook.com/groups/124071018303908/', batch: 4 },
    { name: 'Musica Latina DJ\'s', url: 'https://www.facebook.com/groups/MusicaLatinaDJs/', batch: 4 },
    { name: 'Brunchata Miami Friends', url: 'https://www.facebook.com/groups/455903558230546/', batch: 4 },
    { name: 'Bachata Mexico', url: 'https://www.facebook.com/groups/bachatamexico/', batch: 4 },
    { name: 'Bachata Colombia', url: 'https://www.facebook.com/groups/bachatacolombia/', batch: 4 },
    { name: 'Bailadores de Bachata', url: 'https://www.facebook.com/groups/bailadoresdebachata/', batch: 4 },
    { name: 'Bachata Venezuela', url: 'https://www.facebook.com/groups/bachatavenezuela/', batch: 4 },
    { name: 'Bachata Peru', url: 'https://www.facebook.com/groups/bachataperu/', batch: 4 },
    { name: 'Bachata Argentina', url: 'https://www.facebook.com/groups/bachataargentina/', batch: 4 },
    { name: 'Salsa y Bachata Chile', url: 'https://www.facebook.com/groups/salsabachatachile/', batch: 4 },
    { name: 'Bachata Puerto Rico', url: 'https://www.facebook.com/groups/bachatapuertorico/', batch: 4 },
    { name: 'Reggaeton y Bachata Fans', url: 'https://www.facebook.com/groups/reggaetonybachatafans/', batch: 4 },
    { name: 'Musica Latina Worldwide', url: 'https://www.facebook.com/groups/musicalatinaworldwide/', batch: 4 },

    // ── Batch 5: Orlando + Local LATAM (7 AM EST) ───────────────

    { name: 'Advance Level Bachata Series', url: 'https://www.facebook.com/groups/432085640801277/', batch: 5 },
    { name: 'Orlando Latin Nights', url: 'https://www.facebook.com/groups/1438496766396638/', batch: 5 },
    { name: 'BACHATA ORLANDO', url: 'https://www.facebook.com/groups/457752314851653/', batch: 5 },
    { name: 'Kizomba meets Bachata (#KmB) in Orlando', url: 'https://www.facebook.com/groups/1734954860051839/', batch: 5 },
    { name: 'Going to Sensual Week', url: 'https://www.facebook.com/groups/1858969754384779/', batch: 5 },
    { name: 'LATIN NIGHT Clubs in HAWAII', url: 'https://www.facebook.com/groups/Hawaiislatinclubs/', batch: 5 },
    { name: 'Single Dancer\'s Only', url: 'https://www.facebook.com/groups/847068232090749/', batch: 5 },
    { name: 'Kizomba dans 49', url: 'https://www.facebook.com/groups/Kizomba.dans.49/', batch: 5 },
    { name: 'Trabajo para Latinos en Orlando, Florida', url: 'https://www.facebook.com/groups/trabajo.para.latinos.en.orlando.florida/', batch: 5 },
    { name: 'Latinos en Orlando - Florida', url: 'https://www.facebook.com/groups/334693294170897/', batch: 5 },
    { name: 'Latinos en Orlando & Kissimmee', url: 'https://www.facebook.com/groups/965840944263810/', batch: 5 },
    { name: 'latinos en kissimmee y orlando', url: 'https://www.facebook.com/groups/2353738878272658/', batch: 5 },
    { name: 'Boricuas en Orlando y Kissimmee', url: 'https://www.facebook.com/groups/boricuasenorlando/', batch: 5 },
    { name: 'Comunidad Hispana en Orlando', url: 'https://www.facebook.com/groups/comunidadhispanaenorlando/', batch: 5 },
    { name: 'Puertorriquenos en Orlando & Kissimmee', url: 'https://www.facebook.com/groups/puertorriquenosenorlando/', batch: 5 },
    { name: 'Orlando Events & Things To Do', url: 'https://www.facebook.com/groups/orlandoeventsandthings/', batch: 5 },
    { name: 'Orlando Nightlife & Events', url: 'https://www.facebook.com/groups/orlandonightlife/', batch: 5 },
    { name: 'Tampa Bay Latin Scene', url: 'https://www.facebook.com/groups/tampabaylatinscene/', batch: 5 },

    // ── Batch 6: Content + Film + Music Creators (10 AM EST) ────

    { name: 'Suno & AI Music Creators', url: 'https://www.facebook.com/groups/sunoai/', batch: 6 },
    { name: 'Ai Music Creators', url: 'https://www.facebook.com/groups/2703779406444247/', batch: 6 },
    { name: 'Suno Music Creator\'s Universe', url: 'https://www.facebook.com/groups/1673444546790462/', batch: 6 },
    { name: 'Suno Studio', url: 'https://www.facebook.com/groups/1118818620292019/', batch: 6 },
    { name: 'Orlando FL Actors | Filmmakers | Models', url: 'https://www.facebook.com/groups/205629779822932/', batch: 6 },
    { name: 'Filming in Florida', url: 'https://www.facebook.com/groups/FilmingInFlorida/', batch: 6 },
    { name: 'Orlando Filmmakers', url: 'https://www.facebook.com/groups/504090709674065/', batch: 6 },
    { name: 'MOST INTERESTING VIDEOS', url: 'https://www.facebook.com/groups/707313442694146/', batch: 6 },
    { name: 'Salsa Memes for Spicy Teens', url: 'https://www.facebook.com/groups/salsamemes/', batch: 6 },
    { name: 'Facebook & IG Monetization', url: 'https://www.facebook.com/groups/797906347850253/', batch: 6 },
    { name: 'Insta Reels', url: 'https://www.facebook.com/groups/1121900521601403/', batch: 6 },
    { name: 'Salsa Events', url: 'https://www.facebook.com/groups/661988930486749/', batch: 6 },
    { name: 'Udio AI Music', url: 'https://www.facebook.com/groups/udioaimusic/', batch: 6 },
    { name: 'AI Video Creators', url: 'https://www.facebook.com/groups/aivideocreators/', batch: 6 },
    { name: 'Reels Creators Community', url: 'https://www.facebook.com/groups/reelscreators/', batch: 6 },
    { name: 'Short Video Creators', url: 'https://www.facebook.com/groups/shortvideocreators/', batch: 6 },
    { name: 'Music Video Directors', url: 'https://www.facebook.com/groups/musicvideodirectors/', batch: 6 },
    { name: 'Florida Creative Community', url: 'https://www.facebook.com/groups/floridacreative/', batch: 6 },
    { name: 'Latin Music Producers', url: 'https://www.facebook.com/groups/latinmusicproducers/', batch: 6 },
    { name: 'Viral Video Network', url: 'https://www.facebook.com/groups/viralvideonetwork/', batch: 6 },

    // ── Batch 7: Extended International + Repost (4 PM EST) ─────

    { name: 'Las Vegas Elevated Night with Suavebeats', url: 'https://www.facebook.com/groups/Suavebeatsnews/', batch: 7 },
    { name: 'The Network by Dale Tú', url: 'https://www.facebook.com/groups/thenetworkbydaletu/', batch: 7 },
    { name: 'The Network by We The Culture', url: 'https://www.facebook.com/groups/thenetworkbywetheculture/', batch: 7 },
    { name: 'Tampas Finest Group', url: 'https://www.facebook.com/groups/999477116837187/', batch: 7 },
    { name: 'launch TIME Radio', url: 'https://www.facebook.com/groups/746058509991239/', batch: 7 },
    { name: 'Latin Dance Germany', url: 'https://www.facebook.com/groups/latindancegermany/', batch: 7 },
    { name: 'Bachata Netherlands', url: 'https://www.facebook.com/groups/bachatanetherlands/', batch: 7 },
    { name: 'Salsa y Bachata Portugal', url: 'https://www.facebook.com/groups/salsabachataportugal/', batch: 7 },
    { name: 'Bachata Poland', url: 'https://www.facebook.com/groups/bachatapoland/', batch: 7 },
    { name: 'Latin Dance Sweden', url: 'https://www.facebook.com/groups/latindancesweden/', batch: 7 },
    { name: 'Bachata Switzerland', url: 'https://www.facebook.com/groups/bachataswitzerland/', batch: 7 },
    { name: 'Salsa Bachata Belgium', url: 'https://www.facebook.com/groups/salsabachatabelgium/', batch: 7 },
    { name: 'Kizomba France', url: 'https://www.facebook.com/groups/kizombafrance/', batch: 7 },
    { name: 'Latin Dance Japan', url: 'https://www.facebook.com/groups/latindancejapan/', batch: 7 },
    { name: 'Bachata Korea', url: 'https://www.facebook.com/groups/bachatakorea/', batch: 7 },
    { name: 'Latin Dance Dubai', url: 'https://www.facebook.com/groups/latindancedubai/', batch: 7 },
    { name: 'Salsa Bachata Istanbul', url: 'https://www.facebook.com/groups/salsabachataistanbul/', batch: 7 },
    { name: 'Latin Dance Israel', url: 'https://www.facebook.com/groups/latindanceisrael/', batch: 7 },
    { name: 'Bachata New Zealand', url: 'https://www.facebook.com/groups/bachatanewzealand/', batch: 7 },
    { name: 'Latin Dance Singapore', url: 'https://www.facebook.com/groups/latindancesingapore/', batch: 7 },
];


// ─── Share State Management ─────────────────────────────────────

function loadShareState() {
    const shareStateFile = getShareStateFile();
    try {
        if (fs.existsSync(shareStateFile)) {
            return JSON.parse(fs.readFileSync(shareStateFile, 'utf-8'));
        }
    } catch (err) {
        console.warn(`⚠️ Could not load share state: ${err.message}`);
    }
    return { lastShared: {}, shareLog: [], groupHealth: {} };
}

function getShareStateFile() {
    if (process.env.DANIELSENSUAL_SHARE_STATE_FILE) {
        return process.env.DANIELSENSUAL_SHARE_STATE_FILE;
    }

    if ((process.env.DS_SHARE_IDENTITY_MODE || '').toLowerCase() === 'profile') {
        return path.join(__dirname, '..', '.danielsensual-personal-share-state.json');
    }

    return path.join(__dirname, '..', '.danielsensual-share-state.json');
}

function saveShareState(state) {
    const shareStateFile = getShareStateFile();
    try {
        fs.mkdirSync(path.dirname(shareStateFile), { recursive: true });
        fs.writeFileSync(shareStateFile, JSON.stringify(state, null, 2));
    } catch (err) {
        console.warn(`⚠️ Could not save share state: ${err.message}`);
    }
}

export function recordGroupShare(groupName, postUrl = null) {
    const state = loadShareState();
    state.lastShared[groupName] = {
        timestamp: new Date().toISOString(),
        postUrl,
    };
    state.shareLog.push({
        group: groupName,
        postUrl,
        timestamp: new Date().toISOString(),
    });
    if (state.shareLog.length > 1000) {
        state.shareLog = state.shareLog.slice(-1000);
    }
    // Reset failure counter on success
    if (!state.groupHealth) state.groupHealth = {};
    if (state.groupHealth[groupName]) {
        state.groupHealth[groupName].consecutiveFailures = 0;
        state.groupHealth[groupName].lastSuccess = new Date().toISOString();
    }
    saveShareState(state);
}

/**
 * Record a group failure. After AUTO_DISABLE_THRESHOLD consecutive
 * failures, the group is auto-disabled to stop wasting time.
 */
export function recordGroupFailure(groupName, error = '') {
    const state = loadShareState();
    if (!state.groupHealth) state.groupHealth = {};
    const health = state.groupHealth[groupName] || {
        consecutiveFailures: 0,
        totalFailures: 0,
        autoDisabled: false,
    };
    health.consecutiveFailures++;
    health.totalFailures = (health.totalFailures || 0) + 1;
    health.lastFailure = new Date().toISOString();
    health.lastError = error.substring(0, 200);

    if (health.consecutiveFailures >= AUTO_DISABLE_THRESHOLD && !health.autoDisabled) {
        health.autoDisabled = true;
        health.autoDisabledAt = new Date().toISOString();
        console.log(`   🚫 Auto-disabled "${groupName}" after ${health.consecutiveFailures} consecutive failures`);
    }

    state.groupHealth[groupName] = health;
    saveShareState(state);
}

/**
 * Reset all auto-disabled groups (use after cleaning up group list).
 */
export function resetGroupFailures(groupName = null) {
    const state = loadShareState();
    if (!state.groupHealth) state.groupHealth = {};
    if (groupName) {
        delete state.groupHealth[groupName];
    } else {
        state.groupHealth = {};
    }
    saveShareState(state);
}

/**
 * Check if a group has been auto-disabled due to repeated failures.
 */
export function isGroupAutoDisabled(groupName) {
    const state = loadShareState();
    return state.groupHealth?.[groupName]?.autoDisabled || false;
}

/**
 * Get health status for all share groups.
 */
export function getGroupHealth() {
    const state = loadShareState();
    const health = state.groupHealth || {};
    return SHARE_GROUPS.map(g => ({
        name: g.name,
        batch: g.batch,
        consecutiveFailures: health[g.name]?.consecutiveFailures || 0,
        totalFailures: health[g.name]?.totalFailures || 0,
        autoDisabled: health[g.name]?.autoDisabled || false,
        lastError: health[g.name]?.lastError || null,
    }));
}

function isShareOnCooldown(groupName) {
    const state = loadShareState();
    const last = state.lastShared[groupName];
    if (!last) return false;
    const elapsed = Date.now() - new Date(last.timestamp).getTime();
    return elapsed < SHARE_COOLDOWN_MS;
}

/**
 * Get all groups eligible for video sharing.
 * Filters out groups on cooldown and auto-disabled groups.
 */
export function getShareGroups(options = {}) {
    const ignoreCooldown = options.ignoreCooldown || false;
    return SHARE_GROUPS
        .filter(g => !g.shareDisabled)
        .filter(g => !isGroupAutoDisabled(g.name))
        .filter(g => ignoreCooldown || !isShareOnCooldown(g.name));
}

/**
 * Get share status for all groups.
 */
export function getGroupShareStatus() {
    const state = loadShareState();
    return SHARE_GROUPS.map(g => ({
        name: g.name,
        members: g.members,
        batch: g.batch,
        lastShared: state.lastShared[g.name]?.timestamp || null,
        onCooldown: isShareOnCooldown(g.name),
    }));
}

// ─── Category Detection ─────────────────────────────────────────

const CATEGORY_PATTERNS = {
    BACHATA_DANCE: /bachata.*danc|bachata.*social|sensual.*bachata|bachata.*lover/i,
    LATIN_MUSIC: /bachata.*music|bachata.*video|bachata.*news|dominican.*bachata|reggaeton|latin.*music/i,
    LATIN_DANCE: /salsa|kizomba|latin.*dance|dance.*event|dance.*scene|dance.*night/i,
    LATINO_COMMUNITY: /latino|hispano|boricua|puertorrique|comunidad/i,
    AI_MUSIC: /ai.*music|artificial.*music|ai.*art|ai.*creative/i,
};

export function getGroupCategory(groupName) {
    for (const [category, regex] of Object.entries(CATEGORY_PATTERNS)) {
        if (regex.test(groupName)) return category;
    }
    return 'BACHATA_DANCE'; // default
}

// ─── State Management ───────────────────────────────────────────

function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
        }
    } catch (err) {
        console.warn(`⚠️ Could not load group state: ${err.message}`);
    }
    return { lastPosted: {}, postLog: [] };
}

function saveState(state) {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (err) {
        console.warn(`⚠️ Could not save group state: ${err.message}`);
    }
}

export function recordGroupPost(groupName, pillar, postId = null) {
    const state = loadState();
    state.lastPosted[groupName] = {
        timestamp: new Date().toISOString(),
        pillar,
        postId,
    };
    state.postLog.push({
        group: groupName,
        pillar,
        postId,
        timestamp: new Date().toISOString(),
    });
    // Keep only last 500 log entries
    if (state.postLog.length > 500) {
        state.postLog = state.postLog.slice(-500);
    }
    saveState(state);
}

export function isOnCooldown(groupName, cooldownMs = MIN_COOLDOWN_MS) {
    const state = loadState();
    const last = state.lastPosted[groupName];
    if (!last) return false;

    const elapsed = Date.now() - new Date(last.timestamp).getTime();
    return elapsed < cooldownMs;
}

export function getCooldownRemaining(groupName, cooldownMs = MIN_COOLDOWN_MS) {
    const state = loadState();
    const last = state.lastPosted[groupName];
    if (!last) return 0;

    const elapsed = Date.now() - new Date(last.timestamp).getTime();
    const remaining = cooldownMs - elapsed;
    return remaining > 0 ? remaining : 0;
}

// ─── Group Selection ────────────────────────────────────────────

/**
 * Get groups eligible for posting a specific pillar.
 * Filters by: pillar support, not pending, not on cooldown.
 */
export function getEligibleGroups(pillar, options = {}) {
    const cooldownMs = options.cooldownMs || MIN_COOLDOWN_MS;
    const maxGroups = options.maxGroups || 5; // don't spam too many at once
    const ignoreCooldown = options.ignoreCooldown || false;

    return GROUPS
        .filter(g => !g.pending)
        .filter(g => g.pillars.includes(pillar))
        .filter(g => ignoreCooldown || !isOnCooldown(g.name, cooldownMs))
        .sort((a, b) => a.priority - b.priority || b.members - a.members)
        .slice(0, maxGroups);
}

/**
 * Get posting status for all groups.
 */
export function getGroupStatus() {
    const state = loadState();
    return GROUPS.map(g => ({
        name: g.name,
        category: g.category,
        members: g.members,
        owned: g.owned || false,
        pending: g.pending || false,
        lastPosted: state.lastPosted[g.name] || null,
        onCooldown: isOnCooldown(g.name),
        cooldownRemaining: getCooldownRemaining(g.name),
        pillars: g.pillars,
    }));
}

export default {
    GROUPS,
    SHARE_GROUPS,
    AVOID_GROUPS,
    getGroupCategory,
    getEligibleGroups,
    getGroupStatus,
    getShareGroups,
    getGroupShareStatus,
    getGroupHealth,
    recordGroupPost,
    recordGroupShare,
    recordGroupFailure,
    resetGroupFailures,
    isGroupAutoDisabled,
    isOnCooldown,
    getCooldownRemaining,
};
