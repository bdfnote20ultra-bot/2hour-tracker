import { useState } from "react";

function toMinutes(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

function minutesToHHMM(mins) {
  if (mins == null || isNaN(mins)) return "--:--";
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function calcWorked(start, end) {
  const s = toMinutes(start);
  const e = toMinutes(end);

  if (s == null || e == null) return 0;

  let total = e - s;

  if (total < 0) total += 24 * 60;

  return total;
}

function calcTotalWorked(form) {
  if (!form.shifts || form.shifts.length === 0) return 0;

  let total = 0;

  form.shifts.forEach((shift) => {
    total += calcWorked(shift.start, shift.end);
  });

  return total;
}

export default function App() {
  const [form, setForm] = useState({
    shifts: [{ start: "", end: "" }]
  });

  const totalWorked = calcTotalWorked(form);

  return (
    <div
      style={{
        padding: 20,
        fontFamily: "Arial",
        maxWidth: 500,
        margin: "0 auto"
      }}
    >
      <h1>Hours Tracker</h1>

      {form.shifts.map((shift, index) => (
        <div
          key={index}
          style={{
            marginBottom: 20,
            padding: 12,
            border: "1px solid #ccc",
            borderRadius: 8
          }}
        >
          <div style={{ marginBottom: 10, fontWeight: "bold" }}>
            Shift {index + 1}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <input
              type="time"
              value={shift.start}
              onChange={(e) => {
                const updated = [...form.shifts];
                updated[index].start = e.target.value;
                setForm({ ...form, shifts: updated });
              }}
            />

            <input
              type="time"
              value={shift.end}
              onChange={(e) => {
                const updated = [...form.shifts];
                updated[index].end = e.target.value;
                setForm({ ...form, shifts: updated });
              }}
            />
          </div>

          {form.shifts.length > 1 && (
            <button
              style={{
                marginTop: 10,
                background: "red",
                color: "white",
                border: "none",
                padding: "6px 10px",
                borderRadius: 6,
                cursor: "pointer"
              }}
              onClick={() => {
                setForm({
                  ...form,
                  shifts: form.shifts.filter((_, i) => i !== index)
                });
              }}
            >
              Remove Shift
            </button>
          )}
        </div>
      ))}

      <button
        style={{
          background: "green",
          color: "white",
          border: "none",
          padding: "10px 14px",
          borderRadius: 8,
          cursor: "pointer"
        }}
        onClick={() => {
          setForm({
            ...form,
            shifts: [...form.shifts, { start: "", end: "" }]
          });
        }}
      >
        + Add Shift
      </button>

      <div style={{ marginTop: 30, fontSize: 24 }}>
        Total Worked: {minutesToHHMM(totalWorked)}
      </div>
    </div>
  );
}
