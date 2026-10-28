import { useEffect, useState } from "react"
import { apiRequest, getApiBaseUrl } from "../services/api"

export default function RequestDocuments({ requestId, allowUpload = false }) {
  const [data, setData] = useState({ files: [], legacyNames: [] })
  const [error, setError] = useState("")
  const [uploading, setUploading] = useState(false)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let active = true
    apiRequest(`/api/requests/${requestId}/documents`).then((result) => {
      if (active) setData(result)
    }).catch((err) => { if (active) setError(err.message) })
    return () => { active = false }
  }, [requestId, refresh])
  async function upload(event) {
    const selected = Array.from(event.target.files || [])
    event.target.value = ""
    setUploading(true)
    setError("")
    try {
      for (const file of selected) {
        if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} exceeds the 20 MB limit.`)
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = () => reject(new Error(`Could not read ${file.name}.`))
          reader.readAsDataURL(file)
        })
        await apiRequest(`/api/requests/${requestId}/documents`, { method: "POST", body: JSON.stringify({ name: file.name, type: file.type, data }) })
      }
      setRefresh((value) => value + 1)
    } catch (err) { setError(err.message || "Unable to upload the selected files.") }
    finally { setUploading(false) }
  }
  const base = getApiBaseUrl()
  return <div className="space-y-3">
    <h4 className="text-sm font-semibold">Received documents</h4>
    {error && <p role="alert" className="text-sm text-red">Unable to load documents: {error}</p>}
    {!error && !data.files.length && !data.legacyNames.length && <p className="text-sm text-muted">No files have been uploaded.</p>}
    {allowUpload && <label className="inline-flex min-h-11 max-w-full cursor-pointer flex-wrap items-center rounded-full border border-blue/20 bg-blue/[.035] px-4 py-2.5 text-sm font-semibold text-blue transition-[border-color,background-color] duration-200 hover:border-blue/40 hover:bg-blue/[.07]">{uploading ? "Uploading…" : "Add received files"}<input className="sr-only" type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,application/pdf" disabled={uploading} onChange={upload} /></label>}
    {data.files.map((file) => {
      const url = `${base}${file.url}`
      return <div key={file.id} className="rounded-xl border border-line/90 bg-white p-3.5 shadow-[0_4px_16px_rgba(11,31,58,.035)]">
        <p className="mb-2 break-all text-sm font-medium">{file.name}</p>
        {file.type.startsWith("image/") && <img className="max-h-96 max-w-full rounded object-contain" src={url} alt={file.name} crossOrigin="use-credentials" />}
        {file.type === "video/mp4" && <video className="max-h-96 w-full" controls preload="metadata" crossOrigin="use-credentials" src={url}>Video playback is unavailable in this browser.</video>}
        {file.type === "application/pdf" && <p className="text-sm text-muted">Preview is unavailable for this document. Download it to view.</p>}
        <a className="mt-2 inline-block text-sm font-semibold text-blue underline" href={`${url}?download=1`}>Download</a>
      </div>
    })}
    {data.legacyNames.map((name, i) => <p key={`${name}-${i}`} className="break-all text-sm text-muted">{name} — filename recorded without file contents. Please upload it again to preview or download.</p>)}
  </div>
}
