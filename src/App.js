import { useState } from "react";
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
