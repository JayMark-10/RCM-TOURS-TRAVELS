import { Link } from "react-router-dom"

function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center text-center">
      <div>
        <h1 className="text-3xl font-bold text-navy">Page not found</h1>
        <Link to="/" className="mt-3 inline-block font-semibold text-blue">
          Go home
        </Link>
      </div>
    </div>
  )
}

export default NotFound
