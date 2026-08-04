import "server-only";

const APOLLO_BASE_URL = "https://api.apollo.io/api/v1";

function apolloHeaders() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error("APOLLO_API_KEY is not set.");
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
  };
}

async function apolloPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${APOLLO_BASE_URL}${path}`, {
    method: "POST",
    headers: apolloHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apollo request to ${path} failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<T>;
}

export type ApolloOrganization = {
  id: string;
  name: string;
  website_url?: string;
  primary_domain?: string;
  estimated_num_employees?: number;
  industry?: string;
  parent_id?: string | null;
  parent_name?: string | null;
};

export async function searchOrganization(domain: string) {
  const data = await apolloPost<{ organizations: ApolloOrganization[] }>(
    "/mixed_companies/search",
    { q_organization_domains_list: [domain], page: 1, per_page: 1 }
  );
  return data.organizations[0] ?? null;
}

export type ApolloPerson = {
  id: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  title?: string;
  linkedin_url?: string;
  email?: string;
  email_status?: string;
  city?: string;
  state?: string;
  country?: string;
};

// Title ladder for the buying-committee framework: economic buyer, functional
// owner, operational champion, influencer/router.
export const BUYING_COMMITTEE_TITLES = [
  "CEO",
  "Founder",
  "Co-Founder",
  "President",
  "COO",
  "VP Marketing",
  "VP Ecommerce",
  "VP Growth",
  "Head of Marketing",
  "Head of Ecommerce",
  "Director of Ecommerce",
  "Director of Marketing",
  "Ecommerce Manager",
  "Growth Marketing Manager",
  "Marketing Manager",
];

export async function searchPeople(organizationId: string) {
  const data = await apolloPost<{ people: ApolloPerson[] }>(
    "/mixed_people/search",
    {
      organization_ids: [organizationId],
      person_titles: BUYING_COMMITTEE_TITLES,
      page: 1,
      per_page: 25,
    }
  );
  return data.people;
}

export async function enrichPerson(params: {
  apolloId?: string;
  firstName?: string;
  lastName?: string;
  organizationName?: string;
  domain?: string;
}) {
  const data = await apolloPost<{ person: ApolloPerson | null }>(
    "/people/match",
    {
      id: params.apolloId,
      first_name: params.firstName,
      last_name: params.lastName,
      organization_name: params.organizationName,
      domain: params.domain,
      reveal_personal_emails: false,
    }
  );
  return data.person;
}
