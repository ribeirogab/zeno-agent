export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message: string,
  ) {
    super(message);
  }
}

export interface ApiClientOpts {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export class ApiClient {
  private csrfToken: string | null = null;
  private readonly fetchImpl: typeof fetch;

  constructor(private opts: ApiClientOpts) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async get<T>(path: string): Promise<T> {
    const res = await this.fetchImpl(this.opts.baseUrl + path, { method: 'GET' });
    if (!res.ok)
      throw new ApiError(res.status, await this.tryJson(res), `GET ${path} -> ${res.status}`);
    return res.json() as Promise<T>;
  }

  async post(path: string, body: unknown): Promise<unknown> {
    return this.mutate('POST', path, body);
  }

  async patch(path: string, body?: unknown): Promise<unknown> {
    return this.mutate('PATCH', path, body);
  }

  async delete(path: string): Promise<unknown> {
    return this.mutate('DELETE', path, undefined);
  }

  private async mutate(method: string, path: string, body: unknown): Promise<unknown> {
    const token = this.csrfToken ?? (await this.acquireCsrf());
    const headers: Record<string, string> = {
      'x-csrf-token': token,
      cookie: `zeno_csrf=${token}`,
    };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await this.fetchImpl(this.opts.baseUrl + path, init);
    if (!res.ok) {
      throw new ApiError(res.status, await this.tryJson(res), `${method} ${path} -> ${res.status}`);
    }
    return res.status === 204 ? undefined : res.json();
  }

  private async acquireCsrf(): Promise<string> {
    const res = await this.fetchImpl(`${this.opts.baseUrl}/api/health`, { method: 'GET' });
    const setCookie = res.headers.get('set-cookie') ?? '';
    const match = /zeno_csrf=([^;]+)/.exec(setCookie);
    const token = match?.[1];
    if (!token) throw new Error('failed to acquire CSRF token from /api/health');
    this.csrfToken = token;
    return token;
  }

  private async tryJson(res: Response): Promise<unknown> {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }
}
