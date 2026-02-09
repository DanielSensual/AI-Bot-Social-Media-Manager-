/**
 * Google Maps Places API Scraper
 * Uses the legacy Text Search endpoint (more commonly enabled).
 */

import config from './config.js';
import { createCampaign, insertLeadsBatch, updateCampaignCount } from './db.js';

const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const DETAILS_BASE = 'https://maps.googleapis.com/maps/api/place/details/json';

/**
 * Scrape businesses from Google Maps
 * @param {string} niche - Business type (e.g. "restaurants", "hair salons")
 * @param {string} city - City + state (e.g. "Orlando, FL")
 * @returns {object} { campaignId, leadsFound, leadsInserted }
 */
export async function hunt(niche, city) {
    const apiKey = config.api.googlePlaces;
    if (!apiKey) {
        throw new Error('GOOGLE_PLACES_API_KEY not set in .env');
    }

    console.log(`\n🔍 Hunting: "${niche}" in ${city}...`);

    const campaignId = createCampaign(niche, city);
    const allPlaces = [];
    let pageToken = null;

    // Paginate through results (max 60 across 3 pages)
    for (let page = 0; page < 3; page++) {
        const params = new URLSearchParams({
            query: `${niche} in ${city}`,
            key: apiKey,
        });
        if (pageToken) params.set('pagetoken', pageToken);

        const url = `${PLACES_BASE}?${params}`;
        const response = await fetch(url);

        if (!response.ok) {
            console.error(`❌ API error: ${response.status}`);
            break;
        }

        const data = await response.json();

        if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
            console.error(`❌ API status: ${data.status} — ${data.error_message || ''}`);
            break;
        }

        const places = data.results || [];
        allPlaces.push(...places);
        console.log(`   Page ${page + 1}: ${places.length} businesses found`);

        pageToken = data.next_page_token;
        if (!pageToken) break;

        // Google requires a short delay before using next_page_token
        await new Promise(r => setTimeout(r, 2000));
    }

    // Get additional details (phone, website) for each place
    console.log(`\n   📞 Fetching contact details for ${allPlaces.length} businesses...`);

    const cityParts = city.split(',').map(s => s.trim());
    const leads = [];

    for (let i = 0; i < allPlaces.length; i++) {
        const place = allPlaces[i];
        let phone = null;
        let website = null;

        // Fetch details for phone + website
        try {
            const detailParams = new URLSearchParams({
                place_id: place.place_id,
                fields: 'formatted_phone_number,website',
                key: apiKey,
            });
            const detailRes = await fetch(`${DETAILS_BASE}?${detailParams}`);
            const detailData = await detailRes.json();

            if (detailData.status === 'OK' && detailData.result) {
                phone = detailData.result.formatted_phone_number || null;
                website = detailData.result.website || null;
            }
        } catch { }

        leads.push({
            campaign_id: campaignId,
            place_id: place.place_id,
            business_name: place.name || 'Unknown',
            phone,
            website,
            address: place.formatted_address || null,
            city: cityParts[0] || city,
            state: cityParts[1] || '',
            rating: place.rating || 0,
            review_count: place.user_ratings_total || 0,
        });

        process.stdout.write(`\r   Progress: ${i + 1}/${allPlaces.length}`);

        // Rate limit detail calls
        if (i < allPlaces.length - 1) {
            await new Promise(r => setTimeout(r, 200));
        }
    }

    console.log('');

    // Batch insert (deduplicates by place_id)
    const inserted = insertLeadsBatch(leads);
    updateCampaignCount(campaignId, inserted);

    console.log(`\n✅ Hunt complete: ${allPlaces.length} found, ${inserted} new leads stored`);
    console.log(`   Campaign ID: ${campaignId}`);

    return { campaignId, leadsFound: allPlaces.length, leadsInserted: inserted };
}

