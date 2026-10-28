import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { STATUSES } from "../lib/constants"

const axisStyle = {
  fontSize: 12,
  fill: "#64748b",
}

export function StatusChart({ requests }) {
  const data = []

  for (const status of STATUSES) {
    const count = requests.filter(function (request) {
      return request.status === status
    }).length

    if (count > 0) {
      let displayName = status

      displayName = displayName.replace(
        "Awaiting Customer Confirmation",
        "Await. Customer"
      )

      displayName = displayName.replace(
        "Awaiting Information",
        "Await. Info"
      )

      data.push({
        name: displayName,
        count: count,
      })
    }
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
        <CartesianGrid horizontal={false} stroke="#dce5ef" />

        <XAxis
          type="number"
          allowDecimals={false}
          tick={axisStyle}
          axisLine={false}
          tickLine={false}
        />

        <YAxis
          type="category"
          dataKey="name"
          width={110}
          tick={axisStyle}
          axisLine={false}
          tickLine={false}
        />

        <Tooltip cursor={{ fill: "#eaf0f6" }} />

        <Bar
          dataKey="count"
          fill="#1f5faf"
          radius={[0, 4, 4, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function VolumeChart({ requests = [] }) {
  if (!requests.length) {
    return <p className="p-8 text-center text-sm text-muted">No request volume to chart yet.</p>
  }

  const now = new Date()
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const key = `${year}-${month}`
    return {
      key,
      month: date.toLocaleDateString("en-US", { month: "short" }),
      online: 0,
      walkin: 0,
      phone: 0,
    }
  })
  const byMonth = new Map(months.map((month) => [month.key, month]))
  for (const request of requests) {
    const key = String(request.submitted || "").slice(0, 7)
    const month = byMonth.get(key)
    if (!month) continue
    if (request.source === "Online") month.online += 1
    if (request.source === "Walk-in") month.walkin += 1
    if (request.source === "Phone") month.phone += 1
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={months}>
        <CartesianGrid vertical={false} stroke="#dce5ef" />

        <XAxis
          dataKey="month"
          tick={axisStyle}
          axisLine={false}
          tickLine={false}
        />

        <YAxis
          tick={axisStyle}
          axisLine={false}
          tickLine={false}
        />

        <Tooltip cursor={{ fill: "#eaf0f6" }} />

        <Legend
          iconType="circle"
          wrapperStyle={{ fontSize: 12 }}
        />

        <Bar
          dataKey="online"
          name="Online"
          stackId="a"
          fill="#1f5faf"
        />

        <Bar
          dataKey="walkin"
          name="Walk-in"
          stackId="a"
          fill="#d9364f"
        />

        <Bar
          dataKey="phone"
          name="Phone Call"
          stackId="a"
          fill="#0b1f3a"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function SourcePie({ requests }) {
  const sources = [
    { value: "Online", name: "Online" },
    { value: "Walk-in", name: "Walk-in" },
    { value: "Phone", name: "Phone Call" },
  ]
  const colors = ["#1f5faf", "#d9364f", "#0b1f3a"]
  const data = []

  if (!requests.length) {
    return <p className="p-8 text-center text-sm text-muted">No requests to summarize yet.</p>
  }

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i]

    const count = requests.filter(function (request) {
      return request.source === source.value
    }).length

    data.push({
      name: source.name,
      value: count,
    })
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={2}
        >
          {data.map(function (item, index) {
            return (
              <Cell
                key={item.name}
                fill={colors[index]}
              />
            )
          })}
        </Pie>

        <Tooltip />

        <Legend
          iconType="circle"
          wrapperStyle={{ fontSize: 12 }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}