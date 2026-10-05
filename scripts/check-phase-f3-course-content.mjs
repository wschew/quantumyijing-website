import fs from "node:fs";

const migration=
  fs.readFileSync(
    "database/migrate-v4.0-phase-f3-course-content.sql",
    "utf8"
  );

const course=
  fs.readFileSync(
    "functions/api/portal/course-content.js",
    "utf8"
  );

const resource=
  fs.readFileSync(
    "functions/api/portal/resource.js",
    "utf8"
  );

const page=
  fs.readFileSync(
    "course.html",
    "utf8"
  );

const portal=
  fs.readFileSync(
    "portal.html",
    "utf8"
  );


for(
  const token of [
    "course_modules",
    "course_lessons",
    "course_resources",
    "course_content_access_events",
    "'Published'",
    "'course_view'",
    "'resource_view'"
  ]
){
  if(!migration.includes(token)){
    throw new Error(
      `Missing F3 migration token: ${token}`
    );
  }
}


for(
  const token of [
    "authenticatedCustomer",
    "course_entitlements",
    "ce.customer_id=?",
    "ce.status='Active'",
    "datetime(ce.starts_at)",
    "datetime(ce.ends_at)",
    "course_modules",
    "course_lessons",
    "course_resources",
    "course_view"
  ]
){
  if(!course.includes(token)){
    throw new Error(
      `Missing protected course token: ${token}`
    );
  }
}


if(
  course.includes(
    "content_text:"
  ) ||
  course.includes(
    "resource_url:"
  )
){
  throw new Error(
    "Course outline API must not expose protected resource payload."
  );
}


for(
  const token of [
    "authenticatedCustomer",
    "course_entitlements",
    "customer_id=?",
    "status='Active'",
    "course_resources",
    "content_text",
    "resource_url",
    "resource_view"
  ]
){
  if(!resource.includes(token)){
    throw new Error(
      `Missing protected resource token: ${token}`
    );
  }
}


for(
  const token of [
    "/api/portal/course-content",
    "/api/portal/resource",
    "product_id"
  ]
){
  if(!page.includes(token)){
    throw new Error(
      `Missing course page token: ${token}`
    );
  }
}


if(
  !portal.includes(
    "/course.html?product_id="
  )
){
  throw new Error(
    "Academy Portal course link missing."
  );
}


if(
  course.includes("ADMIN_TOKEN") ||
  resource.includes("ADMIN_TOKEN")
){
  throw new Error(
    "Student content access must use portal session, not ADMIN_TOKEN."
  );
}


console.log(
  "PASS — Phase F3 protected course-content regression guard."
);