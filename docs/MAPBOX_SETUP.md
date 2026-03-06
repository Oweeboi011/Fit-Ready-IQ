# Get Your Mapbox Token

## Quick Setup (5 minutes)

### 1. Create Free Mapbox Account

Go to: <https://account.mapbox.com/auth/signup/>

### 2. Get Your Access Token

After signing up:

- You'll be redirected to your account page
- Look for **"Access tokens"** section
- Copy your **Default public token** (starts with `pk.`)

### 3. Configure Frontend

```bash
cd frontend

# Option A: Copy the example file
cp .env.example .env.local

# Option B: Create new .env.local file
echo "NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_token_here" > .env.local
```

### 4. Add Your Token

Edit `frontend/.env.local`:

NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 5. Restart Dev Server

```bash
### 5. Restart Dev Server
```bash
npm run dev
```

The map should now load with your location!

---

## Full Token Details

### Token Format
Mapbox tokens start with `pk.` (public key):
```
pk.eyJ1IjoiZXhhbXBsZSIsImEiOiJjbHh5ejEyMyJ9.AbCdEfGhIjKlMnOpQrStUv
```

### Token Scopes Required
Your token needs these scopes (default public token has them):
- ✅ `styles:read` - Load map styles
- ✅ `fonts:read` - Display text on maps
- ✅ `styles:tiles` - Render map tiles

### Free Tier Includes
- ✅ 50,000 free map loads per month
- ✅ Outdoor map style (perfect for hiking/biking)
- ✅ Geolocation support
- ✅ No credit card required for free tier

---

## Troubleshooting

### "Token not configured"
**Problem:** `NEXT_PUBLIC_MAPBOX_TOKEN` is empty or missing

**Solution:**
1. Check file exists: `frontend/.env.local`
2. Verify token starts with `pk.`
3. Restart dev server: `Ctrl+C` then `npm run dev`

### "Unauthorized" or 401 Error
**Problem:** Token is invalid or expired

**Solution:**
1. Go to https://account.mapbox.com/access-tokens/
2. Create a **new public token**
3. Update `.env.local` with new token
4. Restart dev server

### "Map not loading"
**Problem:** Token works but map still blank

**Check:**
```bash
# 1. Verify environment variable is loaded
cd frontend
npm run dev

# 2. Check browser console for errors
# Open DevTools (F12) → Console tab

# 3. Verify token in browser
# In console, type:
process.env.NEXT_PUBLIC_MAPBOX_TOKEN
```

### Token Shows in Git
**Problem:** Accidentally committed `.env.local`

**Solution:**
```bash
# Remove from git
git rm --cached frontend/.env.local

# Verify .gitignore includes it
echo ".env.local" >> frontend/.gitignore

# Regenerate token at Mapbox (security best practice)
```

---

## Security Notes

### ✅ Safe for Frontend
- Public tokens (`pk.`) are **safe** to use in frontend code
- They're designed for browser/client-side use
- Can't be used to modify your account

### ✅ .env.local is Protected
- Automatically ignored by Git (`.gitignore`)
- Not deployed to production
- Only exists on your local machine

### ⚠️ Don't Use Secret Tokens
- Never use secret tokens (`sk.`) in frontend
- Secret tokens can modify your account
- Only use in backend/server code

---

## Alternative: Use Environment Variable

If you don't want to create `.env.local`, set it directly:

### Windows (PowerShell)
```powershell
$env:NEXT_PUBLIC_MAPBOX_TOKEN="pk.your_token_here"
npm run dev
```

### Mac/Linux
```bash
export NEXT_PUBLIC_MAPBOX_TOKEN="pk.your_token_here"
npm run dev
```

---

## Need Help?

1. **Mapbox Documentation:** https://docs.mapbox.com/help/getting-started/access-tokens/
2. **Create Account:** https://account.mapbox.com/auth/signup/
3. **View Tokens:** https://account.mapbox.com/access-tokens/

---

## Quick Test

After setup, test your token:

```bash
cd frontend
npm run dev
```

Visit: http://localhost:3000

You should see:
- ✅ Map loads with outdoor style
- ✅ Your location marker appears
- ✅ Route markers visible
- ✅ No "token not configured" error
