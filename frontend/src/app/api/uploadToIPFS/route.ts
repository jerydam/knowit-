import type { NextRequest } from 'next/server';
import axios from 'axios';


export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file || !file.type.startsWith('image/')) {
      return new Response(JSON.stringify({ error: 'Please upload a valid image file.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (file.size > 5 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'Image size must be less than 5MB.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const pinataFormData = new FormData();
    pinataFormData.append('file', new Blob([fileBuffer]), file.name || 'image');

    const pinataJWT = process.env.PINATA_JWT;
    if (!pinataJWT) {
      return new Response(JSON.stringify({ error: 'Pinata JWT not configured.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const response = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', pinataFormData, {
      headers: {
        'Authorization': `Bearer ${pinataJWT}`,
      },
    });

    if (!response.data.IpfsHash) {
      return new Response(JSON.stringify({ error: 'Failed to retrieve IPFS hash.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const ipfsUri = `ipfs://${response.data.IpfsHash}`;
    return new Response(JSON.stringify({ ipfsUri }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('IPFS upload error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
    if (error.response?.status === 401) {
      return new Response(JSON.stringify({ error: 'Invalid Pinata JWT.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    } else if (error.response?.status === 429) {
      return new Response(JSON.stringify({ error: 'Pinata rate limit exceeded.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      return new Response(JSON.stringify({ error: 'Failed to upload image to IPFS.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
}