// Shown by the protected layouts when the session could not be checked because
// the server is unreachable. It does not claim the user is signed in or out,
// and it never renders protected content.
export function AuthConnectionError({ message, onRetry }) {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 p-6 text-center">
      <div
        role="alert"
        className="max-w-sm rounded-xl border border-line bg-white p-8"
      >
        <h1 className="text-lg font-bold text-navy">
          Unable to reach the server
        </h1>

        <p className="mt-2 text-sm text-muted">{message}</p>

        <button
          onClick={onRetry}
          className="mt-5 rounded-lg bg-blue px-4 py-2 text-sm font-semibold text-white"
        >
          Retry
        </button>
      </div>
    </div>
  )
}