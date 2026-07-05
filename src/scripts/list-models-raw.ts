import dotenv from 'dotenv';

dotenv.config();

const key = process.env.GOOGLE_API_KEY;
if (!key) {
    console.error('No GOOGLE_API_KEY found');
    process.exit(1);
}

async function listModels() {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
    console.log(`Fetching models from ${url.replace(key!, '***')}...`);

    try {
        const res = await fetch(url);
        if (!res.ok) {
            console.error(`HTTP Error: ${res.status} ${res.statusText}`);
            const text = await res.text();
            console.error(text);
            return;
        }
        const data = await res.json();
        console.log('Available Models:');
        if (data.models) {
            data.models.forEach((m: any) => {
                console.log(`- ${m.name}`);
            });
        } else {
            console.log('No models found in response:', data);
        }
    } catch (error: any) {
        console.error('Fetch failed:', error.message);
    }
}

listModels();
