# Timing Clef from inside Cloudflare (optional)

`bun run eval:read` reaches Clef over Cloudflare's public REST API from your
laptop. An app would not: a Worker calls Clef and Clef Flash through an AI
binding, inside Cloudflare's network. So the delays in the test's report are
the public route's, and say little about what the add bar would wait.

This folder holds a Worker of its own that measures the other route. It is no
part of the app and changes nothing about it: its own name
(`todos-clef-speed`), no database, no settings. You put it up, ask it once,
and take it down.

What it does when asked, and nothing else:

1. Sends one request of the documented usage (`request.ts`: the tag both
   ways round and the date check, about 5,000 characters, the made-up
   household) to Clef 15 times back to back, then 4 times ten seconds apart.
2. Does the same with Clef Flash.
3. Answers with the median, the 9-in-10 mark, the slowest and every single
   delay, for each model and each pace, and the Cloudflare site it ran at.

Back to back shows the model's own speed. Ten seconds apart is nearer to how
a household types, and shows whether an idle model is slow to wake.

It makes 38 calls to Workers AI, about 50,000 input tokens: under two cents
at Clef's listed price. It takes about a minute and a half, most of it the
waiting.

```bash
# 1. Put it up, with a key of your own so nobody else can run it.
KEY=$(openssl rand -hex 16)
bunx wrangler deploy -c scripts/clef-speed/wrangler.jsonc --var KEY:$KEY

# 2. Ask it once. The address is the one the deploy printed.
curl "https://todos-clef-speed.<your-subdomain>.workers.dev/?key=$KEY"

# 3. Take it down.
bunx wrangler delete -c scripts/clef-speed/wrangler.jsonc
```

`?n=20&spaced=2` changes how many of each; the two can add up to 22 at most,
to stay under the 50 calls a Worker may make for one request.

This has not been run: it was written without a Cloudflare login. The request
it sends is the shape the model page documents
(developers.cloudflare.com/workers-ai/models/clef), and `wrangler deploy
--dry-run` builds it.
