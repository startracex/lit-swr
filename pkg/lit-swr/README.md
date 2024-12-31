# lit-swr

Stale-While-Revalidate data fetching for Lit.

## Installation

```bash
npm i lit-swr
```

## Example

```ts
import { html, LitElement } from "lit";
import { SWR } from "lit-swr";

class UserProfile extends LitElement {
  @SWR("/api/user", fetch, { refreshInterval: 5000 })
  useUser;

  render() {
    const { data, error, isValidating, isLoading } = useUser();
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
