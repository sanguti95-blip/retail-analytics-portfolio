const apiKey = "YOUR_API_KEY_HERE";
const model = "gemini-1.5-flash";
const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        contents: [{ parts: [{ text: "Hola" }] }]
    })
}).then(res => res.text()).then(console.log).catch(console.error);
