/**
 * Google Maps Places API Scraper
 * Finds businesses by niche + city, extracts contact info and website.
 */

import config from './config.js';
import { createCampaign, insertLeadsBatch, updateCampaignCount } from './db.js';

const PLACES_BASE = 'https://places.googleapis.com/v1/places:searchText';

/**
 * Scrape businesses from Google Maps
 * @param {string} niche - Business type (e.g. "restaurants", "hair salons")
 * @param {string} city - City + state (e.g. "Orlando, FL")
 * @param {object} opts - Options
 * @returns {object} { campaignId, leadsFound, leadsInserted }
 */
export async function hunt(niche, city, opts = {}) {
    const apiKey = config.api.googlePlaces;
    if (!apiKey) {
        throw new Error('GOOGLE_PLACES_API_KEY not set in .env');
    }

    console.log(`\n🔍 Hunting: "${niche}" in ${city}...`);

    // Create campaign
    const campaignId = createCampaign(niche, city);

    const allPlaces = [];
    let pageToken = null;

    // Paginate through results (Google returns 20 per page, max ~60)
    for (let page = 0; page < 3; page++) {
        const body = {
            textQuery: `${niche} in ${city}`,
            maxResultCount: 20,
            languageCode: 'en',
        };
        if (pageToken) body.pageToken = pageToken;

        const response = await fetch(PLACES_BASE, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': [
                    'places.id',
                    'places.displayName',
                    'places.formattedAddress',
                    'places.nationalPhoneNumber',
                    'places.websiteUri',
                    'places.rating',
                    'places.userRatingCount',
                    'nextPageToken',
                ].join(','),
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const err = await response.text();
            console.error(`❌ Places API error: ${response.status} — ${err}`);
            break;
        }

        const data = await response.json();
        const places = data.places || [];
        allPlaces.push(...places);

        console.log(`   Page ${page + 1}: ${places.length} businesses found`);

        pageToken = data.nextPageToken;
        if (!pageToken) break;

        // Rate limit between pages
        await new Promise(r => setTimeout(r, 1500));
    }

    // Transform to lead format
    const cityParts = city.split(',').map(s => s.trim());
    const leads = allPlaces.map(place => ({
        campaign_id: campaignId,
        place_id: place.id,
        business_name: place.displayName?.text || 'Unknown',
        phone: place.nationalPhoneNumber || null,
        website: place.websiteUri || null,
        address: place.formattedAddress || null,
        city: cityParts[0] || city,
        state: cityParts[1] || '',
        rating: place.rating || 0,
        review_count: place.userRatingCount || 0,
    }));

    // Batch insert (deduplicates by place_id)
    const inserted = insertLeadsBatch(leads);
    updateCampaignCount(campaignId, inserted);

    console.log(`\n✅ Hunt complete: ${allPlaces.length} found, ${inserted} new leads stored`);
    console.log(`   Campaign ID: ${campaignId}`);

    return { campaignId, leadsFound: allPlaces.length, leadsInserted: inserted };
}
