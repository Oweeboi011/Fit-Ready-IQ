# Get Your Google Maps API Key

## Quick Setup (5 minutes)

### 1. Go to Google Cloud Console
https://console.cloud.google.com/

### 2. Create a New Project (or select existing)
- Click project dropdown → "New Project"
- Name: "Fit-Ready-IQ"
- Click "Create"

### 3. Enable Required APIs
Go to: **APIs & Services → Library**

Enable these APIs:
- ✅ **Maps JavaScript API** (required)
- ✅ **Places API** (for POI search)
- ✅ **Geocoding API** (for address lookup)
- ✅ **Elevation API** (for route profiles)
- ✅ **Directions API** (for routing)

### 4. Create API Key
1. Go to: **APIs & Services → Credentials**
2. Click **"+ CREATE CREDENTIALS"** → API Key
3. Copy your API key (starts with `AIza...`)

### 5. (Optional) Restrict API Key
For security, restrict your key:
- Click on the API key
- **Application restrictions**: HTTP referrers
  - Add: `http://localhost:3000/*`
  - Add: `https://yourdomain.com/*`
- **API restrictions**: Restrict key
  - Select the 5 APIs listed above
- Click **Save**

### 6. Configure Frontend
Edit `frontend/.env.local`:
```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSyC_your_actual_api_key_here
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 7. Install Dependencies & Run
```bash
cd frontend
npm install
npm run dev
```

---

## Free Tier Includes
- ✅ $200 free credit per month
- ✅ Maps: 28,000 loads/month free
- ✅ Places: 17,000 requests/month free
- ✅ Geocoding: 40,000 requests/month free
- ✅ Directions: 40,000 requests/month free

**No credit card required** for development (but recommended for production)

---

## Troubleshooting

### "Error loading Google Maps"
**Solution:**
1. Verify API key is correct in `.env.local`
2. Check APIs are enabled in Google Cloud Console
3. Restart dev server: `Ctrl+C` then `npm run dev`

### "This page can't load Google Maps correctly"
**Solution:**
1. Enable **Maps JavaScript API** in Google Cloud Console
2. Wait 2-3 minutes for changes to propagate
3. Clear browser cache and reload

### "RefererNotAllowedMapError"
**Solution:**
1. Go to Google Cloud Console → Credentials
2. Click your API key
3. Add `http://localhost:3000/*` to HTTP referrers
4. Save and wait 2-3 minutes

---

## Features You Get with Google Maps

✅ **Terrain Map Style** - Perfect for hiking/biking routes
✅ **Street View** - Preview route locations
✅ **Traffic Data** - Real-time traffic info
✅ **POI Database** - Rich location data (gas, food, parking)
✅ **Satellite View** - See actual terrain
✅ **Directions API** - Turn-by-turn navigation

---

## Cost Estimate (Development)

Typical usage for development:
- Map loads: ~1,000/month = **FREE** (within $200 credit)
- API calls: ~500/month = **FREE** (within limits)

You'll stay **within free tier** during development!

---

## Resources

- **Google Cloud Console:** https://console.cloud.google.com/
- **API Documentation:** https://developers.google.com/maps/documentation
- **Pricing:** https://mapsplatform.google.com/pricing/
- **Support:** https://developers.google.com/maps/support

---

## Quick Test

After setup:

```bash
cd frontend
npm run dev
```

Visit: http://localhost:3000

You should see:
- ✅ Google Maps loads with terrain style
- ✅ Your location marker appears (blue circle)
- ✅ Route markers visible
- ✅ Map controls working (zoom, street view, etc.)
