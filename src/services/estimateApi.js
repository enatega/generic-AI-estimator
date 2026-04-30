const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5174/api/estimate';

export async function generateEstimate({ description, hourlyRate, workforce }) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description,
      hourly_rate: hourlyRate,
      workforce,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.message || 'Unable to generate estimate.');
  }

  return data;
}
