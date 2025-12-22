# VPS Deployment Guide

## Prerequisites

### On Your VPS:
1. Ubuntu 20.04+ or similar Linux distribution
2. Node.js 18+ and npm
3. PM2 process manager
4. Nginx (optional, but recommended)
5. Domain name (optional, for HTTPS)

## Step 1: Install Node.js and PM2

```bash
# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version

# Install PM2 globally
sudo npm install -g pm2
```

## Step 2: Clone and Set Up Project

```bash
# Clone your repository (or upload files)
cd /var/www
git clone <your-repo-url> comfyui-app
cd comfyui-app

# Install dependencies
npm install

# Create .env file
cp .env.example .env
nano .env  # Edit with your actual credentials
```

## Step 3: Configure Environment Variables

Edit `.env` file with your actual values:

```env
GEMINI_API_KEY=your_actual_gemini_key
RUNPOD_API_KEY=your_runpod_api_key
RUNPOD_ENDPOINT_ID=your_endpoint_id
NODE_ENV=production
PORT=3000
ALLOWED_ORIGINS=https://yourdomain.com
```

## Step 4: Set Up RunPod Workflow

1. Go to [comfy.getrunpod.io](https://comfy.getrunpod.io)
2. Upload your `z-image_00143_.json` workflow file
3. Click "Analyze" to detect dependencies
4. Deploy to RunPod Serverless
5. Copy the Endpoint ID and API Key to your `.env`

## Step 5: Start Application with PM2

```bash
# Start the app
pm2 start ecosystem.config.js

# Check status
pm2 status

# View logs
pm2 logs comfyui-gemini-studio

# Set PM2 to start on system reboot
pm2 startup
pm2 save
```

## Step 6: Configure Firewall

```bash
# Allow HTTP, HTTPS, and SSH
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

## Step 7: Set Up Nginx Reverse Proxy (Recommended)

```bash
# Install Nginx
sudo apt-get install nginx

# Create Nginx config
sudo nano /etc/nginx/sites-available/comfyui-app

# Paste the following (replace yourdomain.com):
```

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/comfyui-app /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Step 8: Set Up SSL with Let's Encrypt (Recommended)

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Certbot will automatically configure Nginx for HTTPS
# Test auto-renewal
sudo certbot renew --dry-run
```

## Step 9: Monitoring and Maintenance

### View Application Logs
```bash
pm2 logs comfyui-gemini-studio
```

### Monitor Resource Usage
```bash
pm2 monit
```

### Restart Application
```bash
pm2 restart comfyui-gemini-studio
```

### Update Application
```bash
cd /var/www/comfyui-app
git pull
npm install
pm2 restart comfyui-gemini-studio
```

## Troubleshooting

### Check if app is running
```bash
pm2 status
curl http://localhost:3000/api/health
```

### Check Nginx status
```bash
sudo systemctl status nginx
sudo nginx -t  # Test config
```

### View error logs
```bash
pm2 logs --err
tail -f /var/log/nginx/error.log
```

### Common Issues

**Port 3000 already in use:**
```bash
sudo lsof -i :3000
# Kill the process or change PORT in .env
```

**RunPod connection fails:**
- Verify `RUNPOD_API_KEY` and `RUNPOD_ENDPOINT_ID` in `.env`
- Check RunPod endpoint is active: https://www.runpod.io/console/serverless
- Test API: `curl -H "Authorization: Bearer $RUNPOD_API_KEY" https://api.runpod.ai/v2/status`

**Rate limiting too strict:**
- Edit rate limits in `src/server.ts`
- Restart: `pm2 restart comfyui-gemini-studio`

## Security Checklist

- [ ] `.env` file has correct permissions (600)
- [ ] Firewall is enabled and configured
- [ ] SSH key authentication enabled (disable password auth)
- [ ] HTTPS/SSL certificate installed
- [ ] Rate limiting configured
- [ ] CORS origins restricted in production
- [ ] Regular security updates: `sudo apt-get update && sudo apt-get upgrade`

## Cost Optimization

**RunPod Tips:**
- Use serverless (pay per use) instead of dedicated pods
- Monitor usage in RunPod dashboard
- Set up request caching if applicable
- Consider rate limiting to prevent abuse
