# Deploying to Production

Choose your deployment platform and follow the steps.

## Quick Comparison

| Platform | Setup Time | Cost | Scaling | Best For |
|----------|-----------|------|---------|----------|
| **Heroku** | 5 min | $12-50/mo | ⭐⭐⭐ | Fast MVP |
| **AWS** | 15 min | $30-100/mo | ⭐⭐⭐⭐⭐ | Scale |
| **DigitalOcean** | 10 min | $6-24/mo | ⭐⭐⭐⭐ | Simple + cheap |
| **Google Cloud** | 12 min | $25-100/mo | ⭐⭐⭐⭐⭐ | Google ecosystem |

---

## Option 1: Heroku (Fastest - 5 minutes)

### Step 1: Install Heroku CLI
```bash
# macOS
brew tap heroku/brew && brew install heroku

# Windows (download from https://devcenter.heroku.com/articles/heroku-cli)

# Linux
curl https://cli-assets.heroku.com/install-ubuntu.sh | sh
```

### Step 2: Login to Heroku
```bash
heroku login
```

### Step 3: Create App
```bash
cd "Day Spa Ai Receptionist"
heroku create spa-ai-receptionist-001
```

### Step 4: Set Environment Variables
```bash
heroku config:set TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
heroku config:set TWILIO_AUTH_TOKEN=your_auth_token
heroku config:set TWILIO_PHONE_NUMBER=+64991234567
heroku config:set HUMAN_QUEUE_NUMBER=+64991235000
heroku config:set SENDGRID_API_KEY=SG.xxxxxxxx
heroku config:set NODE_ENV=production
```

Or set them in Heroku Dashboard → Settings → Config Vars

### Step 5: Add Procfile
Create `Procfile` (no extension) in project root:
```
web: node server.js
```

### Step 6: Deploy
```bash
git add .
git commit -m "Deploy to Heroku"
git push heroku main  # or master
```

### Step 7: Test
```bash
heroku logs --tail
heroku open   # Opens your app in browser

# Test the API
curl https://spa-ai-receptionist-001.herokuapp.com/health
```

### Step 8: Get Your Public URL
```bash
heroku apps:info

# Your app URL: https://spa-ai-receptionist-001.herokuapp.com
# Use this for Twilio webhook: https://spa-ai-receptionist-001.herokuapp.com/api/voice/inbound
```

### Heroku Pros & Cons
✅ Fastest deployment
✅ Auto-scaling
✅ Built-in logging
❌ Pricey for high volume
❌ Limited control

---

## Option 2: AWS EC2 (Most Control - 15 minutes)

### Step 1: Create EC2 Instance
1. Go to AWS Console → EC2 → Instances → Launch Instance
2. Choose **Ubuntu 22.04 LTS** (free tier eligible)
3. Instance type: **t2.micro** (free tier)
4. Storage: **30 GB gp3** (free tier)
5. Security group: Allow HTTP (80), HTTPS (443), SSH (22)
6. Launch with key pair (save the .pem file)

### Step 2: Connect to Instance
```bash
chmod 600 your-key.pem
ssh -i your-key.pem ubuntu@your-instance-ip
```

### Step 3: Install Dependencies
```bash
sudo apt update
sudo apt install nodejs npm git -y

# Verify
node --version
npm --version
```

### Step 4: Clone Repository
```bash
git clone https://github.com/your-repo/spa-ai-receptionist.git
cd spa-ai-receptionist
npm install
```

### Step 5: Configure Environment
```bash
nano .env
# Paste your environment variables
# Ctrl+X to save
```

### Step 6: Install PM2 (Process Manager)
```bash
sudo npm install -g pm2
pm2 start server.js --name "receptionist"
pm2 startup
pm2 save
```

### Step 7: Set Up Nginx (Reverse Proxy)
```bash
sudo apt install nginx -y

# Create config
sudo nano /etc/nginx/sites-available/receptionist
```

Paste this:
```nginx
server {
  listen 80;
  server_name your-domain.com;

  location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

Then:
```bash
sudo ln -s /etc/nginx/sites-available/receptionist /etc/nginx/sites-enabled/
sudo systemctl restart nginx
```

### Step 8: SSL Certificate (Free with Let's Encrypt)
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com
```

### Step 9: Test
```bash
curl https://your-domain.com/health
```

### AWS Pros & Cons
✅ Most control
✅ Scales infinitely
✅ Lots of features
❌ More complex setup
❌ Need to manage updates

---

## Option 3: DigitalOcean App Platform (Sweet Spot - 10 minutes)

### Step 1: Create Account
Go to https://www.digitalocean.com and sign up

### Step 2: Connect GitHub
1. Link your GitHub account in DigitalOcean
2. Authorize the app

### Step 3: Create App
1. Click "Create" → "App"
2. Select your GitHub repository
3. Choose branch: main
4. DigitalOcean auto-detects it's Node.js

### Step 4: Configure
1. Set Environment Variables:
   - TWILIO_ACCOUNT_SID
   - TWILIO_AUTH_TOKEN
   - SENDGRID_API_KEY
   - etc.

2. Configure Resource:
   - Type: Basic tier ($12/mo)
   - Memory: 512 MB
   - 1 shared CPU

### Step 5: Deploy
Click "Deploy App" and wait 2-3 minutes

### Step 6: Get URL
Your app is now live at: `https://your-app-name.ondigitalocean.app`

### DigitalOcean Pros & Cons
✅ Simple deployment
✅ Good pricing
✅ Built-in auto-scaling
❌ Less powerful than AWS
❌ Smaller ecosystem

---

## Option 4: Google Cloud Run (Containerized - 15 minutes)

### Step 1: Install Cloud SDK
```bash
curl https://sdk.cloud.google.com | bash
gcloud init
```

### Step 2: Create Dockerfile
Create `Dockerfile` in project root:
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
```

### Step 3: Build & Deploy
```bash
gcloud builds submit --tag gcr.io/your-project/receptionist

gcloud run deploy receptionist \
  --image gcr.io/your-project/receptionist \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "TWILIO_ACCOUNT_SID=ACxxxxxxxx,TWILIO_AUTH_TOKEN=xxx"
```

### Google Cloud Pros & Cons
✅ Auto-scaling
✅ Pay per use
✅ Serverless
❌ More complex
❌ Vendor lock-in

---

## Post-Deployment Checklist

Once deployed, follow this checklist:

- [ ] App is running: `curl https://your-app.com/health` returns OK
- [ ] Logs are accessible
- [ ] Environment variables are set correctly
- [ ] HTTPS is enabled (not HTTP)
- [ ] WebSocket is working (test with real Twilio if possible)
- [ ] Database connection works (if using PostgreSQL)
- [ ] Monitoring is set up (error alerts)
- [ ] Backups are configured (if applicable)
- [ ] SSL certificate auto-renewal is enabled

---

## Twilio Configuration (All Platforms)

Once deployed, configure Twilio:

1. Go to Twilio Console → Phone Numbers → Manage Numbers
2. Click your NZ number
3. Set Voice Webhook:
   - **URL**: `https://your-app.com/api/voice/inbound`
   - **Method**: POST
   - **Save**

4. Set Status Webhook (optional):
   - **URL**: `https://your-app.com/api/voice/status`
   - **Method**: POST

5. Test with real call:
   ```bash
   # Call your Twilio number
   # Should hear greeting and be able to book
   ```

---

## Monitoring & Logging

### Heroku
```bash
heroku logs --tail
```

### AWS
```bash
# SSH into instance
ssh -i key.pem ubuntu@ip

# View PM2 logs
pm2 logs

# Or use CloudWatch
# AWS Console → CloudWatch → Logs
```

### DigitalOcean
Dashboard → Your App → Logs → check activity

### Google Cloud Run
Cloud Run Dashboard → Your Service → Logs

---

## Scaling (When You Have Traffic)

### Heroku
```bash
heroku ps:scale web=2:standard-2x
```

### AWS
- Use Auto Scaling Group
- Configure to scale based on CPU/memory

### DigitalOcean App Platform
- Set auto-scaling in dashboard
- Min/max replicas

### Google Cloud Run
- Auto-scales by default
- Min instances: 0 (saves money)
- Max instances: set as needed

---

## Updating Code

### Heroku
```bash
git push heroku main
```

### AWS (via GitHub)
```bash
# Push to GitHub
git push origin main

# Redeploy from instance
cd /path/to/repo
git pull
npm install
pm2 restart receptionist
```

### DigitalOcean App Platform
- Auto-deploys on GitHub push (if configured)

### Google Cloud Run
```bash
gcloud builds submit --tag gcr.io/your-project/receptionist
gcloud run deploy receptionist --image gcr.io/your-project/receptionist
```

---

## Cost Breakdown

### Heroku (Most Expensive for Continuous Use)
- Web dyno: $25/mo
- PostgreSQL: $15/mo
- Redis: $30/mo
- **Total: ~$70/mo**

### AWS (Best for Scale)
- EC2 t2.micro: ~$10/mo
- RDS (PostgreSQL) db.t3.micro: ~$15/mo
- ElastiCache (Redis) cache.t3.micro: ~$15/mo
- Data transfer: ~$10/mo
- **Total: ~$50/mo**

### DigitalOcean (Best Value)
- App Platform: $12/mo
- PostgreSQL Managed: $15/mo
- Redis Managed: $15/mo
- **Total: ~$42/mo**

### Google Cloud Run (Best for Low Usage)
- Compute: $0.0000002 per request (pay per use)
- Cloud SQL: $15/mo
- Memorystore: $15/mo
- Estimated (200 calls/day): ~$40/mo

---

## Recommended Setup for MVP

**Use DigitalOcean App Platform:**
- Fast deployment (10 min)
- Good pricing ($42/mo)
- Built-in monitoring
- Auto-scaling included
- Easy to upgrade later

---

## After Going Live

1. **Monitor calls**: Track success rate, error rate, escalation rate
2. **Gather feedback**: Talk to business owner about experience
3. **Iterate on responses**: Fine-tune AI responses based on real calls
4. **Add more businesses**: Replicate the multi-tenant config
5. **Plan Phase 2**: Analytics, advanced features, more integrations

---

## Troubleshooting Deployment

**App crashes on startup**
```bash
# Check if there are syntax errors
node server.js

# Check if dependencies are installed
npm install
```

**Can't connect to Twilio**
```bash
# Verify webhook URL is correct
# Twilio Console → Phone Numbers → Your Number

# Test webhook directly
curl -X POST https://your-app.com/api/voice/inbound
```

**Out of memory**
- Upgrade instance size
- Add more memory allocation
- Check for memory leaks in code

---

**Status**: ✅ You're ready to deploy
**Next Step**: Choose a platform and follow the steps above
**Time Estimate**: 5-15 minutes depending on platform
