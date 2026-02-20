# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

### Deploy on Vercel

1. Push this repository to GitHub.
2. In Vercel, click **Add New Project** and import the repo.
3. Vercel will detect `vercel.json` and use:
	- Build Command: `npm run build`
	- Output Directory: `dist`
4. Add these environment variables in Vercel Project Settings:
	- `VITE_SUPABASE_URL`
	- `VITE_SUPABASE_PUBLISHABLE_KEY`
5. Deploy.

For local setup, copy `.env.example` to `.env` and set real values.

### GitHub auto-deploy setup (Preview + Production)

1. Import this repository into Vercel once.
2. In Vercel, go to **Project Settings → Git** and keep auto-deploy enabled.
3. In **Project Settings → Environment Variables**, add the same keys for:
	- **Production**
	- **Preview**
	- `VITE_SUPABASE_URL`
	- `VITE_SUPABASE_PUBLISHABLE_KEY`
4. Set your production branch to `main` (or your default release branch).
5. Push workflow:
	- Any PR/branch push → automatic **Preview** deployment
	- Push/merge to production branch → automatic **Production** deployment

Optional CLI helpers in this repo:

- `npm run vercel:login`
- `npm run vercel:link`
- `npm run vercel:pull:preview`
- `npm run vercel:pull:production`
- `npm run vercel:deploy:preview`
- `npm run vercel:deploy:prod`

### Instagram-style adaptive reels (Mux HLS)

This repo now supports adaptive bitrate playback for new uploads when Mux is enabled.

1. Apply the migration:
	- `supabase/migrations/20260220190000_mux_streaming_support.sql`
2. Deploy Edge Functions:
	- `supabase/functions/create-mux-direct-upload`
	- `supabase/functions/mux-webhook`
3. Set Supabase function secrets:
	- `MUX_TOKEN_ID`
	- `MUX_TOKEN_SECRET`
	- `MUX_WEBHOOK_SECRET` (from Mux webhook signing secret)
4. In frontend env (`.env` / hosting env), set:
	- `VITE_ENABLE_MUX_STREAMING=true`
5. In Mux dashboard, add webhook endpoint for your deployed function URL:
	- `<SUPABASE_FUNCTIONS_URL>/mux-webhook`
	- Subscribe to: `video.upload.asset_created`, `video.asset.ready`, `video.asset.errored`, `video.upload.errored`
6. One-command deployment from this repo:
	- Export required env vars:
	  - `SUPABASE_ACCESS_TOKEN`
	  - `SUPABASE_PROJECT_REF` (optional, defaults to `cjxhrnajkaqhwxccfflk`)
	  - `MUX_TOKEN_ID`
	  - `MUX_TOKEN_SECRET`
	  - `MUX_WEBHOOK_SECRET`
	- Run: `npm run supabase:deploy:mux`

Behavior:
- Uploads create a pending video row.
- File uploads directly to Mux.
- Webhook updates `video_url` to `https://stream.mux.com/<playback_id>.m3u8` when ready.
- Home player uses HLS ABR for `.m3u8` and falls back to regular MP4 URLs.

### Deploy from Lovable

Open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
