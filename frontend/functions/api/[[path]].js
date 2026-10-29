export async function onRequest({ request, env }) {
  let apiOrigin
  try {
    apiOrigin = new URL(env.API_ORIGIN)
    if (apiOrigin.protocol !== "https:" || apiOrigin.username || apiOrigin.password || apiOrigin.pathname !== "/" || apiOrigin.search || apiOrigin.hash) {
      throw new Error("Invalid API origin")
    }
  } catch {
    return Response.json({ error: "API proxy is not configured." }, { status: 503 })
  }

  const incomingUrl = new URL(request.url)
  const upstreamUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, apiOrigin)
  try {
    const upstream = await fetch(upstreamUrl, new Request(upstreamUrl, request))
    const headers = new Headers(upstream.headers)
    headers.set("Cache-Control", "no-store")
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    })
  } catch {
    return Response.json({ error: "The API is temporarily unavailable." }, {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    })
  }
}
