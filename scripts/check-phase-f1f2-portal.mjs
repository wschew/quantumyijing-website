import fs from "node:fs";

const migration=
  fs.readFileSync(
    "database/migrate-v4.0-phase-f1f2-academy-portal.sql",
    "utf8"
  );

const auth=
  fs.readFileSync(
    "functions/api/portal/_auth.js",
    "utf8"
  );

const requestLink=
  fs.readFileSync(
    "functions/api/portal/request-link.js",
    "utf8"
  );

const consume=
  fs.readFileSync(
    "functions/api/portal/consume.js",
    "utf8"
  );

const me=
  fs.readFileSync(
    "functions/api/portal/me.js",
    "utf8"
  );

const logout=
  fs.readFileSync(
    "functions/api/portal/logout.js",
    "utf8"
  );

const portal=
  fs.readFileSync(
    "portal.html",
    "utf8"
  );


for(
  const token of [
    "academy_portal_magic_links",
    "academy_portal_sessions",
    "academy_portal_events",
    "token_hash TEXT NOT NULL UNIQUE",
    "FOREIGN KEY(customer_id)"
  ]
){
  if(!migration.includes(token)){
    throw new Error(
      `Missing portal migration token: ${token}`
    );
  }
}


for(
  const token of [
    "QY_PORTAL_SESSION",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "authenticatedCustomer",
    "sha256"
  ]
){
  if(!auth.includes(token)){
    throw new Error(
      `Missing portal auth token: ${token}`
    );
  }
}


for(
  const token of [
    "customer_identifiers",
    "magic_link_requested",
    "15*60*1000",
    "RESEND_API_KEY",
    "If this email is eligible"
  ]
){
  if(!requestLink.includes(token)){
    throw new Error(
      `Missing request-link token: ${token}`
    );
  }
}


for(
  const token of [
    "academy_portal_magic_links",
    "academy_portal_sessions",
    "login_success",
    "sessionCookie",
    "7*24*60*60*1000"
  ]
){
  if(!consume.includes(token)){
    throw new Error(
      `Missing consume token: ${token}`
    );
  }
}


for(
  const token of [
    "course_entitlements",
    "memberships",
    "subscriptions",
    "customer_enquiry_links",
    "authenticatedCustomer"
  ]
){
  if(!me.includes(token)){
    throw new Error(
      `Missing portal dashboard token: ${token}`
    );
  }
}


if(
  !logout.includes(
    "clearSessionCookie"
  ) ||
  !logout.includes(
    "revoked_at=CURRENT_TIMESTAMP"
  )
){
  throw new Error(
    "Portal logout revocation missing."
  );
}


for(
  const token of [
    "Academy Portal",
    "学院学员平台",
    "/api/portal/request-link",
    "/api/portal/consume",
    "/api/portal/me",
    "/api/portal/logout"
  ]
){
  if(!portal.includes(token)){
    throw new Error(
      `Missing portal UI token: ${token}`
    );
  }
}


if(
  requestLink.includes("ADMIN_TOKEN") ||
  consume.includes("ADMIN_TOKEN") ||
  me.includes("ADMIN_TOKEN")
){
  throw new Error(
    "Customer portal must not use ADMIN_TOKEN authentication."
  );
}


console.log(
  "PASS — Phase F1+F2 Academy Portal regression guard."
);