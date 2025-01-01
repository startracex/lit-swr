# lit-swr

Stale-While-Revalidate data fetching for Lit.

## Installation

```bash
npm i lit-swr
```

## Examples

### With decorator:

```ts
import { html, LitElement } from "lit";
import { SWR, type SWRController } from "lit-swr";

class UserProfile extends LitElement {
  //       key     fetcher         options
  @SWR("/api/user", fetch, { refreshInterval: 5000 })
  useUser: () => SWRController<
    string, // key type
    {
      id: string;
      name: string;
      email: string;
    } // data type
  >;

  render() {
    const { data, error, isValidating, isLoading } = this.useUser();
    if (error) {
      return html`<div>Failed to load: ${error.message}</div>`;
    }
    if (isLoading) {
      return html`<div>Loading</div>`;
    }
    return html`
      <h2>${data.name} ${isValidating ? "🔄" : ""}</h2>
      <p>👤 ${data.id}</p>
      <p>📧 ${data.email}</p>
      <p>💼 ${data.role}</p>
    `;
  }
}
```

### With class property:

```ts
import { createSWR } from "lit-swr";
class UserProfile extends LitElement {
  useUser = createSWR(this, "/api/user", fetch, { refreshInterval: 5000 });
}
```

### With function:

```ts
import { useSWR } from "lit-swr";
class UserProfile extends LitElement {
  render() {
    const { data, error, isValidating, isLoading } = useSWR(this, "/api/user", fetch, { refreshInterval: 5000 });
  }
}
```
