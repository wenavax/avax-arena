/**
 * Layer.ai GraphQL API client for warrior image generation.
 * Server-side only — never expose the API key to the client.
 */

const LAYER_API_URL = 'https://api.app.layer.ai/';
const WORKSPACE_ID = process.env.LAYER_AI_WORKSPACE_ID || '92c1e987-8456-4433-bff0-8db05078485a';
const STYLE_ID = process.env.LAYER_AI_STYLE_ID || 'db9bb724-3779-437d-aad4-b1a97092047e'; // Concept Art

interface CreateInferenceResult {
  id: string;
  imageUrl: string;
  status: string;
}

interface LayerApiResponse {
  data?: {
    createInference?: {
      id?: string;
      status?: string;
      files?: { url: string; previewUrl?: string }[];
      // Error union fields
      type?: string;
      code?: string;
      title?: string;
      message?: string;
    };
  };
  errors?: { message: string }[];
}

function getApiKey(): string {
  const key = process.env.LAYER_AI_API_KEY;
  if (!key) {
    throw new Error('LAYER_AI_API_KEY environment variable is not set');
  }
  return key;
}

/**
 * Generate a warrior image using Layer.ai's CreateInference mutation.
 * Uses sync: true for synchronous generation.
 */
export async function generateWarriorImage(prompt: string): Promise<CreateInferenceResult> {
  const apiKey = getApiKey();

  const mutation = `
    mutation CreateInference($input: CreateInferenceInput!) {
      createInference(input: $input) {
        ... on Inference {
          id
          status
          files {
            url
            previewUrl
          }
        }
        ... on Error {
          type
          code
          title
          message
        }
      }
    }
  `;

  const variables = {
    input: {
      workspaceId: WORKSPACE_ID,
      sync: true,
      parameters: {
        prompt,
        width: 1024,
        height: 1024,
        batchSize: 1,
        styles: [{ id: STYLE_ID }],
      },
    },
  };

  const response = await fetch(LAYER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query: mutation, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Layer.ai API error (${response.status}): ${text}`);
  }

  const json = (await response.json()) as LayerApiResponse;

  if (json.errors && json.errors.length > 0) {
    throw new Error(`Layer.ai GraphQL error: ${json.errors[0].message}`);
  }

  const result = json.data?.createInference;
  if (!result) {
    throw new Error('Layer.ai returned no data');
  }

  // Check for Error union type
  if (result.code || result.type) {
    throw new Error(`Layer.ai error: ${result.title || result.message || result.code}`);
  }

  const imageUrl = result.files?.[0]?.url ?? '';

  return {
    id: result.id ?? '',
    imageUrl,
    status: result.status ?? 'unknown',
  };
}

/**
 * Poll Layer.ai for inference completion if needed.
 */
export async function pollInferenceStatus(inferenceId: string, maxAttempts = 30): Promise<string> {
  const apiKey = getApiKey();

  const query = `
    query GetInferences($ids: [ID!]!) {
      getInferencesById(ids: $ids) {
        ... on Inference {
          id
          status
          files {
            url
          }
        }
        ... on Error {
          message
        }
      }
    }
  `;

  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(LAYER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, variables: { ids: [inferenceId] } }),
    });

    if (!response.ok) continue;

    const json = (await response.json()) as {
      data?: {
        getInferencesById?: Array<{
          id?: string;
          status?: string;
          files?: { url: string }[];
          message?: string;
        }>;
      };
    };

    const inference = json.data?.getInferencesById?.[0];
    if (inference?.status === 'COMPLETE' && inference.files?.[0]?.url) {
      return inference.files[0].url;
    }

    if (inference?.status === 'FAILED' || inference?.message) {
      throw new Error(`Layer.ai image generation failed: ${inference.message ?? 'unknown'}`);
    }

    // Wait 2 seconds before next poll
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error('Layer.ai image generation timed out');
}
