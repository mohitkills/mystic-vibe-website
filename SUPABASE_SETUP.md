# Supabase browser configuration

This static website uses Supabase Auth from the browser. Its project URL and
publishable key (or a legacy `anon` key) are browser-safe identifiers; visitors
can see them in the downloaded site code. Supabase access must still be
restricted with authentication and Row Level Security policies.

1. Copy `js/supabase-config.example.js` to `js/supabase-config.js`.
2. Set `SUPABASE_URL` to the Supabase project URL and
   `SUPABASE_PUBLISHABLE_KEY` to the project's publishable key.
3. Keep `js/supabase-config.js` local. It is excluded from Git by `.gitignore`.
4. Serve the site over HTTP(S), rather than opening pages with `file://`, so
   browser ES modules can load.
5. In Supabase Auth → URL Configuration, set the Site URL to the deployed site
   and add its URLs to the Redirect URLs allow list. For local testing, add the
   exact origin used by your development server, including scheme and port; for
   example, `http://localhost:5500/**` and/or `http://127.0.0.1:5500/**`.
   Replace `5500` with the port your server actually uses. The signup flow sends
   the confirmation link back to `login.html` on the current site origin.
   Password reset links return to `reset-password.html` on the same origin.
   Both paths must match an allowed Redirect URL. Do not use `file://`.
6. With Confirm Email enabled, Supabase returns a user without an active
   session after signup. The page asks the user to check email; after the link
   is confirmed, Supabase redirects to the login page and the user can sign in.
   If Confirm Email is disabled, signup may return an active session directly.
7. For deployment, provision the ignored `js/supabase-config.js` in the
   deployment workspace before publishing the static files. This project has
   no build step to inject environment variables.

Never place a `service_role` key, a `sb_secret_` key, database password, or any
other privileged secret in browser code or a deployed static-site configuration.
The browser integration rejects secret-style keys. Do not commit `.env.local`
or any other credential-bearing environment file.

Authentication is initialized from the existing shared `app.js`, so session
state is restored across pages and the existing account links provide logout
when signed in. Published product records merge into the static catalog so local artwork remains available as a fallback.

## Private product image delivery

Product image uploads stay in the private `mystic-vibe-images` bucket. The
storefront requests `supabase/functions/product-image` with the publishable key,
product slug, saved image index, and a SHA-256 version of the saved reference.
The Edge Function checks that the product is currently published, resolves the
requested image from that product's ordered `image_urls`, and returns only an
allowed image file. The object path and privileged key stay server-side. The
`mystic-vibe-media` bucket is never served by this endpoint.

The function must be deployed once before newly uploaded private product images
can appear to anonymous storefront visitors. After review and approval, deploy
only this function with:

```powershell
supabase functions deploy product-image --project-ref abjvxemteuhnkuvpkess
```

The function uses Supabase's Edge Function key handling; do not add a secret to
browser configuration or commit one to this repository. Until the function is
deployed, storefront cards and galleries continue to use their local artwork
fallback. Replacing an image uploads a new unique object path, so the saved
reference hash changes and the storefront requests a fresh image URL after the
product record is saved.
