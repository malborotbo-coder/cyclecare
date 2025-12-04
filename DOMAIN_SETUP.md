# Domain Setup Guide - Cycle Care

## 🌐 Connecting Custom Domain: cyclecatrtec.com

This guide explains how to connect your custom domain **cyclecatrtec.com** to your Cycle Care application deployed on Replit.

---

## 📋 Prerequisites

Before you begin, make sure you have:

- ✅ Access to your domain registrar (where you purchased cyclecatrtec.com)
- ✅ Your Replit project deployed and published
- ✅ Admin access to your Replit account

---

## 🚀 Step 1: Deploy Your Application on Replit

1. **Open your Replit project**
2. **Click the "Deploy" button** (or go to the Deployments tab)
3. **Configure deployment settings:**
   - Build command: `./build-ios.sh` (or `npx vite build --base=./`)
   - Run command: `npm start` (already configured)
   - Port: `5000` (already configured)
4. **Click "Deploy"** and wait for the deployment to complete
5. **Note the deployment URL** (e.g., `your-project.replit.app`)

---

## 🔗 Step 2: Link Domain in Replit

1. **Go to the Deployments tab** in your Replit project
2. **Click on "Settings"**
3. **Find the "Custom Domains" section**
4. **Click "Link a domain"** or **"Manually connect from another registrar"**
5. **Enter your domain:** `cyclecatrtec.com`
6. **Replit will provide you with DNS records:**
   - **A Record:** Points to Replit's IP address
   - **TXT Record:** Verifies domain ownership

**Example DNS Records:**
```
Type: A
Host: @ (or blank)
Value: 123.456.789.012 (Replit's IP)
TTL: 3600

Type: TXT
Host: @ (or cyclecatrtec.com)
Value: replit-verification=abc123xyz456
TTL: 3600
```

⚠️ **Important:** Copy these exact values from Replit - the examples above are placeholders.

---

## 🌍 Step 3: Configure DNS Records at Your Registrar

### For GoDaddy:
1. Log in to your GoDaddy account
2. Go to "My Products" > "DNS"
3. Click "Manage" next to cyclecatrtec.com
4. **Add A Record:**
   - Type: A
   - Name: @ (or leave blank)
   - Value: [IP from Replit]
   - TTL: Default or 3600
5. **Add TXT Record:**
   - Type: TXT
   - Name: @ (or leave blank)
   - Value: [Verification code from Replit]
   - TTL: Default or 3600
6. Click "Save"

### For Namecheap:
1. Log in to Namecheap
2. Go to "Domain List" > Click "Manage"
3. Go to "Advanced DNS" tab
4. **Add A Record:**
   - Type: A Record
   - Host: @
   - Value: [IP from Replit]
   - TTL: Automatic
5. **Add TXT Record:**
   - Type: TXT Record
   - Host: @
   - Value: [Verification code from Replit]
   - TTL: Automatic
6. Click the checkmark to save

### For Other Registrars:
- Look for "DNS Management" or "DNS Settings"
- Add the A and TXT records with the values provided by Replit
- If your registrar doesn't support "@" as hostname, use your full domain name

---

## ⏳ Step 4: Wait for DNS Propagation

- DNS changes can take **15 minutes to 48 hours** to fully propagate
- Typically, it takes **30 minutes to 2 hours**
- You can check propagation status at: https://www.whatsmydns.net

**To check if it's working:**
```bash
# Check A record
dig cyclecatrtec.com

# Check TXT record
dig TXT cyclecatrtec.com
```

---

## ✅ Step 5: Verify Domain in Replit

1. **Go back to Replit Deployments** > **Settings** > **Custom Domains**
2. **Click "Verify"** next to your domain
3. **Once verified**, you'll see a "Verified" status with a green checkmark
4. **Replit will automatically provision SSL/TLS certificate** (HTTPS)

---

## 🔒 Step 6: SSL/TLS Certificate (HTTPS)

Replit automatically provides **free SSL/TLS certificates** for custom domains:

- ✅ Certificate is issued automatically after domain verification
- ✅ Auto-renewal (no manual action required)
- ✅ Your site will be accessible via `https://cyclecatrtec.com`

---

## 📱 Step 7: Update iOS App Configuration (Optional)

If you want your iOS app to connect to your custom domain instead of localhost:

1. **Edit `capacitor.config.ts`:**
   ```typescript
   const config: CapacitorConfig = {
     appId: 'com.cyclecatrtec.app',
     appName: 'Cycle Care',
     webDir: 'dist/public',
     server: {
       androidScheme: 'https',
       url: 'https://cyclecatrtec.com', // Add this line
       cleartext: false
     },
     ios: {
       contentInset: 'always'
     }
   };
   ```

2. **Rebuild the iOS app:**
   ```bash
   ./build-ios.sh
   ```

3. **Resync with Xcode:**
   ```bash
   npx cap sync ios
   ```

4. **Open in Xcode and run:**
   ```bash
   cd ios/App && open App.xcworkspace
   ```

---

## 🎯 Step 8: Add Subdomain (Optional)

If you want to add a subdomain like `www.cyclecatrtec.com` or `api.cyclecatrtec.com`:

1. **In Replit**, click "Add another domain"
2. **In your DNS settings**, add a new A record:
   ```
   Type: A
   Host: www (or api, app, etc.)
   Value: [Same Replit IP]
   TTL: 3600
   ```

---

## 🔧 Troubleshooting

### Domain not verifying?
- ✅ Double-check DNS records match exactly what Replit provided
- ✅ Wait 30-60 minutes for DNS propagation
- ✅ Clear your DNS cache: `sudo dscacheutil -flushcache` (Mac)
- ✅ Try incognito/private browsing mode

### SSL certificate not working?
- ✅ Make sure domain is verified in Replit
- ✅ Wait 5-10 minutes after verification
- ✅ Try accessing via `https://` explicitly

### Site showing old content?
- ✅ Redeploy your application in Replit
- ✅ Clear browser cache (Cmd+Shift+R on Mac)
- ✅ Check if DNS is pointing to correct IP

---

## 📧 Support Contacts

- **Domain Issues:** Contact your domain registrar support
- **Replit Deployment:** Check Replit documentation or support
- **App Issues:** Review `IOS_SETUP_GUIDE_AR.md` for iOS-specific help

---

## 🎉 Success Checklist

Once everything is set up correctly, you should be able to:

- ✅ Access your app at `https://cyclecatrtec.com`
- ✅ See the green padlock (SSL/TLS) in browser
- ✅ Domain shows "Verified" status in Replit
- ✅ Privacy Policy accessible at `https://cyclecatrtec.com/privacy`
- ✅ Terms of Service accessible at `https://cyclecatrtec.com/terms`
- ✅ iOS app (if configured) connects to custom domain

---

**🚀 Your Cycle Care application is now live at cyclecatrtec.com!**
