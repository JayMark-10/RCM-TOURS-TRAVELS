
import {
  ArrowRight,
  FilePenLine,
  Mail,
  MapPin,
  Phone,
  SearchCheck,
  Send,
  UserCheck,
} from "lucide-react"
import { ServiceIcon } from "../../components/RequestParts"
import { Button, ButtonLink } from "../../components/ui"
import { destinations, HERO_IMAGE } from "../../lib/catalog"
import { useStore } from "../../lib/store"
import { Logo } from "../../layouts/PublicLayout"

const steps = [
  {
    icon: FilePenLine,
    title: "Submit a request",
    text: "Choose a service and fill in the details that apply to your plans.",
  },
  {
    icon: SearchCheck,
    title: "Staff review",
    text: "An RCM staff member reviews it and may ask for missing information.",
  },
  {
    icon: Send,
    title: "Receive updates",
    text: "Follow the status timeline, respond to questions, and review any quotation.",
  },
  {
    icon: UserCheck,
    title: "Confirmation & completion",
    text: "Service or booking details are recorded only once verified, then the request is completed.",
  },
]

export default function Home() {
  const {
    services,
    servicesLoading,
    servicesError,
    refreshServices,
    settings,
    settingsLoading,
    settingsError,
    refreshSettings,
  } = useStore()

  const activeServices = services.filter((service) => service.active)

  return (
    <>
      <section className="relative isolate min-h-[600px] overflow-hidden bg-navy sm:min-h-[660px]">
        <img
          src={HERO_IMAGE}
          alt="Travel illustration of a plane flying above the coastal clouds at sunset"
          className="absolute inset-0 -z-10 h-full w-full object-cover opacity-80"
        />

        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-navy/95 via-navy/75 to-navy/30" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-48 bg-gradient-to-t from-navy/55 to-transparent" />

        <div className="mx-auto grid min-h-[600px] max-w-7xl gap-8 px-5 py-20 sm:min-h-[660px] sm:gap-10 sm:px-8 sm:py-24 lg:grid-cols-[1.35fr_.85fr] lg:py-28">
          <div className="self-center">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[.16em] text-white backdrop-blur-sm">
              <span className="h-2 w-2 rounded-full bg-red" /> Travel assistance, made clear
            </p>

            <h1 className="max-w-3xl break-words font-display text-4xl font-normal leading-[1.02] tracking-[-.035em] text-white sm:text-6xl lg:text-7xl xl:text-8xl">
              Travel plans, <span className="text-[#ff8792]">handled with care.</span>
            </h1>

            <p className="mt-5 max-w-xl text-base leading-7 text-slate-200 sm:mt-6 sm:text-lg sm:leading-8">
              Request travel and document assistance, share the details once, and follow every update from our team in one secure place.
            </p>

            <div className="mt-7 flex flex-wrap gap-3 sm:mt-9">
              <ButtonLink to="/portal/new" size="lg" className="rounded-full">
                Request a Service <ArrowRight size={18} />
              </ButtonLink>

              <ButtonLink to="/#how" size="lg" variant="light" className="rounded-full">
                How it works
              </ButtonLink>
            </div>

            <p className="mt-6 flex max-w-lg items-start gap-2 text-sm leading-6 text-slate-300">
              <UserCheck size={17} className="mt-0.5 shrink-0 text-[#ffb1ba]" />
              Every request is reviewed by our team. Booking confirmation is recorded only after arrangements are verified.
            </p>
          </div>

          <div className="hidden self-end lg:block">
            <div className="rounded-2xl border border-white/50 bg-white/95 p-7 shadow-[0_24px_70px_rgba(4,23,50,.28)] backdrop-blur">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-red/10 text-red"><FilePenLine size={23} /></div>
              <p className="font-display text-2xl text-navy">A smoother way to get started</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                Tell us where you want to go and what support you need. Your request, messages, and quotation stay together.
              </p>
              <div className="mt-6 border-t border-line pt-4 text-xs font-semibold uppercase tracking-wider text-blue">One request · Clear updates · Personal support</div>
            </div>
          </div>
        </div>
      </section>

      <section id="services" className="scroll-mt-20 bg-surface py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <SectionHead
            eyebrow="Services"
            title="Assistance you can request"
            sub="Choose from the services currently available in the RCM request catalog."
          />

          {servicesLoading ? (
            <p role="status" className="mt-10 text-sm text-muted">Loading services...</p>
          ) : servicesError ? (
            <div role="alert" className="mt-10 flex flex-wrap items-center gap-3 text-sm text-red-700">
              <span>Services could not be loaded.</span>
              <Button variant="outline" size="sm" onClick={refreshServices}>Retry</Button>
            </div>
          ) : activeServices.length === 0 ? (
            <p className="mt-10 text-sm text-muted">No services are currently available.</p>
          ) : (
          <div className="mt-8 grid grid-cols-2 items-stretch gap-3 sm:mt-10 sm:gap-4 lg:grid-cols-4">
            {activeServices.map((service) => (
              <div
                key={service.id}
                className="group flex min-w-0 flex-col rounded-2xl border border-white/80 bg-white/75 p-3.5 shadow-[0_8px_30px_rgba(11,31,58,.07)] backdrop-blur-xl transition duration-200 hover:-translate-y-1 hover:border-blue/25 hover:bg-white/90 hover:shadow-[0_18px_38px_rgba(11,31,58,.12)] sm:p-5 lg:p-6"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue/10 text-blue sm:h-11 sm:w-11">
                  <ServiceIcon icon={service.icon} />
                </span>

                <h3 className="mt-3 break-words text-sm font-semibold leading-5 text-navy [overflow-wrap:anywhere] sm:mt-4 sm:text-base">
                  {service.name}
                </h3>

                <p className="mt-1.5 flex-1 break-words text-xs leading-5 text-muted [overflow-wrap:anywhere] sm:mt-2 sm:text-sm sm:leading-relaxed">
                  {service.description}
                </p>

                <ButtonLink
                  to={`/portal/new?service=${service.id}`}
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full self-stretch px-2 text-xs leading-4 sm:mt-5 sm:w-auto sm:self-start sm:px-3.5 sm:text-[13px]"
                >
                  Request this service
                </ButtonLink>
              </div>
            ))}
          </div>
          )}
        </div>
      </section>

      <section id="destinations" className="scroll-mt-20 py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <SectionHead
            eyebrow="Destinations"
            title="Where our customers ask about"
            sub="Promotional examples only. Availability and arrangements are confirmed per request."
          />

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {destinations.map((destination, index) => (
              <article
                key={destination.name}
                className={`group relative overflow-hidden rounded-2xl bg-navy shadow-[0_16px_38px_rgba(11,31,58,.16)] ${
                  index % 2 ? "lg:mt-8" : ""
                }`}
              >
                <img
                  src={destination.image}
                  alt={destination.alt}
                  className="h-72 w-full object-cover transition-transform duration-700 group-hover:scale-105 sm:h-[27rem]"
                />

                <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/30 to-transparent" />

                <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                  <h3 className="font-display text-2xl font-normal">
                    {destination.name}
                  </h3>

                  <p className="mt-1 text-sm text-slate-200">
                    {destination.blurb}
                  </p>

                  <ButtonLink
                    to="/portal/new?service=tour"
                    variant="light"
                    size="sm"
                    className="mt-4"
                  >
                    Ask about {destination.name}
                  </ButtonLink>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="scroll-mt-20 bg-navy py-16 text-white sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <SectionHead
            dark
            eyebrow="How it works"
            title="Four steps from request to completion"
          />

          <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => {
              const StepIcon = step.icon

              return (
                <li
                  key={step.title}
                  className="rounded-2xl border border-white/12 bg-white/[.045] p-6"
                >
                  <div className="flex items-center justify-between">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-red">
                      <StepIcon size={19} />
                    </span>

                    <span className="text-3xl font-bold text-white/20">
                      0{index + 1}
                    </span>
                  </div>

                  <h3 className="mt-4 font-semibold">{step.title}</h3>

                  <p className="mt-2 text-sm leading-relaxed text-slate-300">
                    {step.text}
                  </p>
                </li>
              )
            })}
          </ol>
        </div>
      </section>

      <section id="contact" className="scroll-mt-20 bg-white py-16 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-8 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHead
              eyebrow="Contact"
              title="Talk to our team"
              sub="Use the configured RCM contact details for questions about a request."
              left
            />

            <ul className="mt-8 space-y-4 text-sm">
              {settingsLoading ? (
                <li role="status" className="text-muted">Loading contact details...</li>
              ) : settingsError ? (
                <li role="alert" className="flex flex-wrap items-center gap-3 text-red-700">
                  <span>Contact details could not be loaded.</span>
                  <Button variant="outline" size="sm" onClick={refreshSettings}>Retry</Button>
                </li>
              ) : (
                <>
                  {settings.contactPhone && <li className="flex min-w-0 items-start gap-3"><Phone size={18} className="mt-0.5 shrink-0 text-red" /><span className="min-w-0 break-words [overflow-wrap:anywhere]">{settings.contactPhone}</span></li>}
                  {settings.contactEmail && <li className="flex min-w-0 items-start gap-3"><Mail size={18} className="mt-0.5 shrink-0 text-red" /><span className="min-w-0 break-words [overflow-wrap:anywhere]">{settings.contactEmail}</span></li>}
                  {settings.address && <li className="flex min-w-0 items-start gap-3"><MapPin size={18} className="mt-0.5 shrink-0 text-red" /><span className="min-w-0 break-words [overflow-wrap:anywhere]">{settings.address}</span></li>}
                  {!settings.contactPhone && !settings.contactEmail && !settings.address && (
                    <li className="text-sm text-muted">Contact details are not configured yet.</li>
                  )}
                </>
              )}
            </ul>
          </div>

          <div className="relative isolate overflow-hidden rounded-2xl border border-line bg-surface p-6 shadow-[0_16px_45px_rgba(11,31,58,.08)] sm:p-8">
            <img src="/images/home/request-travel.svg" alt="" aria-hidden="true" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-25" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-white/95 via-white/85 to-white/60" />
            <h3 className="text-lg font-semibold text-navy">
              Prefer to visit or call?
            </h3>

            <p className="mt-2 text-sm text-muted">
              Staff can encode walk-in and phone inquiries into the same system,
              so you can still track your request online with the same reference
              number.
            </p>

            <ButtonLink to="/portal/new" className="mt-6 w-fit">
              Request a Service
            </ButtonLink>
          </div>
        </div>
      </section>

      <footer className="bg-navy text-slate-300">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-10 sm:px-8 md:flex-row md:items-center md:justify-between">
          <Logo dark />

          <p className="max-w-md text-xs leading-relaxed text-slate-400">
            {settings.disclaimer}
          </p>

          <p className="text-xs text-slate-500">
            © {new Date().getFullYear()} {settings.companyName}.
          </p>
        </div>
      </footer>
    </>
  )
}

function SectionHead({ eyebrow, title, sub, dark, left }) {
  const headingColor = dark ? "text-white" : "text-navy"
  const containerWidth = left ? "" : "max-w-2xl"

  return (
    <div className={containerWidth}>
      <p className="text-[11px] font-bold uppercase tracking-[.16em] text-red">
        {eyebrow}
      </p>

      <h2
        className={`mt-2 font-display text-4xl font-normal leading-[1.08] tracking-[-.025em] sm:text-5xl ${headingColor}`}
      >
        {title}
      </h2>

      {sub && <p className="mt-4 max-w-2xl text-sm leading-7 text-muted sm:text-base">{sub}</p>}
    </div>
  )
}
