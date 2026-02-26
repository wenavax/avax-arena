import * as dotenv from 'dotenv';

dotenv.config();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ElementType =
  | 'Fire'
  | 'Water'
  | 'Wind'
  | 'Ice'
  | 'Earth'
  | 'Thunder'
  | 'Shadow'
  | 'Light';

export interface WarriorAttributes {
  name: string;
  element: ElementType;
  attack: number;
  defense: number;
  speed: number;
  level?: number;
  rarity?: 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';
}

interface InferenceFile {
  __typename: string;
  id: string;
  url: string;
}

interface InferenceSuccess {
  __typename: 'Inference';
  id: string;
  status: string;
  files: InferenceFile[];
}

interface InferenceError {
  __typename: 'Error';
  code: string;
  message: string;
}

type InferenceResult = InferenceSuccess | InferenceError;

interface CreateInferenceResponse {
  data?: {
    createInference: InferenceResult;
  };
  errors?: Array<{ message: string }>;
}

interface CacheEntry {
  url: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Element visual descriptors
// ---------------------------------------------------------------------------

const ELEMENT_VISUALS: Record<ElementType, string> = {
  Fire: 'red and orange glowing aura, blazing flame effects emanating from armor, ember particles',
  Water: 'blue and cyan liquid armor plating, flowing water energy shield, aquatic shimmer',
  Wind: 'green swirling energy vortex, translucent wind currents around limbs, aerial wisps',
  Ice: 'crystalline frost armor with icicle protrusions, frozen breath mist, pale blue glow',
  Earth: 'stone and bronze heavy plated armor, rocky texture with moss accents, seismic cracks glowing amber',
  Thunder: 'electric yellow and purple lightning arcs, crackling energy gauntlets, static field aura',
  Shadow: 'dark purple and black stealth suit, shadow tendrils, void-like cloak with faint violet edges',
  Light: 'golden and white radiant armor, holy light beams, luminous halo and glowing runes',
};

// ---------------------------------------------------------------------------
// Stat-level descriptor mapping
// ---------------------------------------------------------------------------

function statLevel(value: number): string {
  if (value >= 90) return 'overwhelming';
  if (value >= 70) return 'formidable';
  if (value >= 50) return 'moderate';
  if (value >= 30) return 'developing';
  return 'minimal';
}

// ---------------------------------------------------------------------------
// GraphQL mutation
// ---------------------------------------------------------------------------

const CREATE_INFERENCE_MUTATION = `
mutation CreateInference($createInferenceInput: CreateInferenceInput!) {
  createInference(input: $createInferenceInput) {
    __typename
    ... on Inference {
      id
      status
      files {
        __typename
        id
        url
      }
    }
    ... on Error {
      code
      message
    }
  }
}
`;

// ---------------------------------------------------------------------------
// LayerAIService
// ---------------------------------------------------------------------------

export class LayerAIService {
  private readonly apiKey: string;
  private readonly endpoint = 'https://api.app.layer.ai/';
  private readonly workspaceId: string;
  private readonly styleId: string;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly cacheTtlMs: number;

  /**
   * @param apiKey      Layer.ai PAT. Defaults to env LAYER_AI_API_KEY.
   * @param cacheTtlMs  How long cached URLs remain valid (default 1 hour).
   */
  constructor(apiKey?: string, cacheTtlMs = 3_600_000) {
    const resolvedKey = apiKey ?? process.env.LAYER_AI_API_KEY;
    if (!resolvedKey) {
      throw new Error(
        'Layer.ai API key is required. Pass it to the constructor or set LAYER_AI_API_KEY.',
      );
    }
    this.apiKey = resolvedKey;
    this.cacheTtlMs = cacheTtlMs;

    this.workspaceId = process.env.LAYER_AI_WORKSPACE_ID ?? 'PLACEHOLDER_WORKSPACE_ID';
    this.styleId = process.env.LAYER_AI_STYLE_ID ?? 'PLACEHOLDER_STYLE_ID';

    if (this.workspaceId === 'PLACEHOLDER_WORKSPACE_ID') {
      console.warn('[layer-ai] LAYER_AI_WORKSPACE_ID is not set; using placeholder.');
    }
    if (this.styleId === 'PLACEHOLDER_STYLE_ID') {
      console.warn('[layer-ai] LAYER_AI_STYLE_ID is not set; using placeholder.');
    }
  }

  // ---- Public API ---------------------------------------------------------

  /**
   * Generate an NFT-style warrior image based on the given attributes.
   * Returns the URL of the generated image.
   */
  async generateWarriorImage(attributes: WarriorAttributes): Promise<string> {
    const prompt = this.buildWarriorPrompt(attributes);
    const cacheKey = `warrior:${attributes.name}:${attributes.element}:${attributes.attack}:${attributes.defense}:${attributes.speed}`;

    const cached = this.getFromCache(cacheKey);
    if (cached) {
      console.log(`[layer-ai] Cache hit for warrior "${attributes.name}".`);
      return cached;
    }

    const url = await this.createInference(prompt, 1024, 1024);
    this.setCache(cacheKey, url);
    return url;
  }

  /**
   * Generate a generic site visual asset from a free-form prompt.
   * Returns the URL of the generated image.
   */
  async generateSiteAsset(prompt: string, width = 1024, height = 1024): Promise<string> {
    const fullPrompt = `${prompt}, digital art, web3 aesthetic, dark background with neon accents, 4k detailed`;
    const cacheKey = `site:${prompt}:${width}x${height}`;

    const cached = this.getFromCache(cacheKey);
    if (cached) {
      console.log('[layer-ai] Cache hit for site asset.');
      return cached;
    }

    const url = await this.createInference(fullPrompt, width, height);
    this.setCache(cacheKey, url);
    return url;
  }

  /**
   * Generate a battle scene depicting two warriors facing off.
   * Returns the URL of the generated image.
   */
  async generateBattleScene(
    warrior1: WarriorAttributes,
    warrior2: WarriorAttributes,
  ): Promise<string> {
    const cacheKey = `battle:${warrior1.name}:${warrior1.element}:${warrior2.name}:${warrior2.element}`;

    const cached = this.getFromCache(cacheKey);
    if (cached) {
      console.log('[layer-ai] Cache hit for battle scene.');
      return cached;
    }

    const w1Visual = ELEMENT_VISUALS[warrior1.element];
    const w2Visual = ELEMENT_VISUALS[warrior2.element];

    const prompt = [
      'Epic battle scene in a futuristic neon arena, two cyber warriors facing off in combat stance,',
      `left warrior: ${warrior1.element}-themed, ${w1Visual},`,
      `right warrior: ${warrior2.element}-themed, ${w2Visual},`,
      'energy clash between them, sparks and particle effects,',
      'dramatic lighting, wide cinematic composition,',
      'digital art, web3 aesthetic, dark background with glowing effects, 4k detailed',
    ].join(' ');

    const url = await this.createInference(prompt, 1536, 1024);
    this.setCache(cacheKey, url);
    return url;
  }

  // ---- Private helpers ----------------------------------------------------

  /**
   * Build a deterministic, themed prompt for a warrior NFT image.
   */
  private buildWarriorPrompt(attributes: WarriorAttributes): string {
    const elementVisual = ELEMENT_VISUALS[attributes.element];
    const attackLevel = statLevel(attributes.attack);
    const defenseLevel = statLevel(attributes.defense);
    const speedLevel = statLevel(attributes.speed);

    const rarityDetail =
      attributes.rarity && attributes.rarity !== 'Common'
        ? `, ${attributes.rarity.toLowerCase()} rarity with ornate detailing`
        : '';

    const levelDetail =
      attributes.level && attributes.level > 1
        ? `, level ${attributes.level} veteran warrior`
        : '';

    return [
      `Futuristic cyber warrior in a neon arena,`,
      `${attributes.element}-themed,`,
      `${elementVisual},`,
      `attack power ${attackLevel}, defense ${defenseLevel}, speed ${speedLevel},`,
      `digital art, web3 aesthetic, dark background with glowing effects, 4k detailed`,
      `${rarityDetail}${levelDetail}`,
    ]
      .join(' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /**
   * Execute a createInference mutation against the Layer.ai GraphQL API.
   */
  private async createInference(
    prompt: string,
    width: number,
    height: number,
  ): Promise<string> {
    const variables = {
      createInferenceInput: {
        sync: true,
        workspaceId: this.workspaceId,
        parameters: {
          batchSize: 1,
          generationType: 'CREATE',
          guidanceScale: 6,
          width,
          height,
          numInferenceSteps: 20,
          prompt,
          styles: [{ id: this.styleId, weight: 1.0 }],
        },
      },
    };

    console.log(`[layer-ai] Requesting inference (${width}x${height})...`);

    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          query: CREATE_INFERENCE_MUTATION,
          variables,
        }),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`[layer-ai] Network request failed: ${message}`);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '<unreadable>');
      throw new Error(
        `[layer-ai] API returned HTTP ${response.status}: ${body}`,
      );
    }

    let json: CreateInferenceResponse;
    try {
      json = (await response.json()) as CreateInferenceResponse;
    } catch {
      throw new Error('[layer-ai] Failed to parse API response as JSON.');
    }

    // Handle top-level GraphQL errors
    if (json.errors && json.errors.length > 0) {
      const messages = json.errors.map((e) => e.message).join('; ');
      throw new Error(`[layer-ai] GraphQL errors: ${messages}`);
    }

    const result = json.data?.createInference;
    if (!result) {
      throw new Error('[layer-ai] Unexpected API response: missing createInference data.');
    }

    // Handle union-type error response
    if (result.__typename === 'Error') {
      const errResult = result as InferenceError;
      throw new Error(
        `[layer-ai] Inference error (${errResult.code}): ${errResult.message}`,
      );
    }

    // Extract image URL from successful inference
    const inference = result as InferenceSuccess;
    if (!inference.files || inference.files.length === 0) {
      throw new Error(
        `[layer-ai] Inference ${inference.id} completed with status "${inference.status}" but returned no files.`,
      );
    }

    const imageUrl = inference.files[0].url;
    console.log(
      `[layer-ai] Inference ${inference.id} complete. Status: ${inference.status}. URL: ${imageUrl}`,
    );

    return imageUrl;
  }

  // ---- Cache helpers ------------------------------------------------------

  private getFromCache(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.cacheTtlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.url;
  }

  private setCache(key: string, url: string): void {
    this.cache.set(key, { url, timestamp: Date.now() });
  }
}

// ---------------------------------------------------------------------------
// Singleton instance (lazy – does not throw at import time if env is missing)
// ---------------------------------------------------------------------------

let _instance: LayerAIService | null = null;

export function getLayerAIService(): LayerAIService {
  if (!_instance) {
    _instance = new LayerAIService();
  }
  return _instance;
}

export default LayerAIService;
