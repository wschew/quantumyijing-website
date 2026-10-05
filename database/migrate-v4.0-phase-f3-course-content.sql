-- ============================================================
-- Quantum YiJing v4.0
-- Phase F3 — Protected Course Content
--
-- Additive only.
-- Course ownership remains course_entitlements.
-- ============================================================


CREATE TABLE IF NOT EXISTS course_modules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    module_reference TEXT NOT NULL UNIQUE,

    product_id INTEGER NOT NULL,

    title_en TEXT NOT NULL DEFAULT '',
    title_zh TEXT NOT NULL DEFAULT '',

    description_en TEXT NOT NULL DEFAULT '',
    description_zh TEXT NOT NULL DEFAULT '',

    sort_order INTEGER NOT NULL DEFAULT 0,

    status TEXT NOT NULL DEFAULT 'Draft'
        CHECK(status IN(
            'Draft',
            'Published',
            'Archived'
        )),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(product_id)
        REFERENCES products(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_course_modules_product
    ON course_modules(product_id);

CREATE INDEX IF NOT EXISTS idx_course_modules_product_status
    ON course_modules(product_id,status);



CREATE TABLE IF NOT EXISTS course_lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    lesson_reference TEXT NOT NULL UNIQUE,

    module_id INTEGER NOT NULL,

    title_en TEXT NOT NULL DEFAULT '',
    title_zh TEXT NOT NULL DEFAULT '',

    summary_en TEXT NOT NULL DEFAULT '',
    summary_zh TEXT NOT NULL DEFAULT '',

    sort_order INTEGER NOT NULL DEFAULT 0,

    status TEXT NOT NULL DEFAULT 'Draft'
        CHECK(status IN(
            'Draft',
            'Published',
            'Archived'
        )),

    available_from TEXT NOT NULL DEFAULT '',
    available_until TEXT NOT NULL DEFAULT '',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(module_id)
        REFERENCES course_modules(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_course_lessons_module
    ON course_lessons(module_id);

CREATE INDEX IF NOT EXISTS idx_course_lessons_module_status
    ON course_lessons(module_id,status);



CREATE TABLE IF NOT EXISTS course_resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    resource_reference TEXT NOT NULL UNIQUE,

    lesson_id INTEGER NOT NULL,

    resource_type TEXT NOT NULL
        CHECK(resource_type IN(
            'text',
            'video',
            'link',
            'download'
        )),

    title_en TEXT NOT NULL DEFAULT '',
    title_zh TEXT NOT NULL DEFAULT '',

    description_en TEXT NOT NULL DEFAULT '',
    description_zh TEXT NOT NULL DEFAULT '',

    content_text TEXT NOT NULL DEFAULT '',
    resource_url TEXT NOT NULL DEFAULT '',

    sort_order INTEGER NOT NULL DEFAULT 0,

    status TEXT NOT NULL DEFAULT 'Draft'
        CHECK(status IN(
            'Draft',
            'Published',
            'Archived'
        )),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(lesson_id)
        REFERENCES course_lessons(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_course_resources_lesson
    ON course_resources(lesson_id);

CREATE INDEX IF NOT EXISTS idx_course_resources_lesson_status
    ON course_resources(lesson_id,status);



CREATE TABLE IF NOT EXISTS course_content_access_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    customer_id INTEGER NOT NULL,
    course_entitlement_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,

    resource_id INTEGER,

    event_type TEXT NOT NULL
        CHECK(event_type IN(
            'course_view',
            'resource_view'
        )),

    user_agent TEXT NOT NULL DEFAULT '',

    accessed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(customer_id)
        REFERENCES customers(id)
        ON DELETE CASCADE,

    FOREIGN KEY(course_entitlement_id)
        REFERENCES course_entitlements(id)
        ON DELETE CASCADE,

    FOREIGN KEY(product_id)
        REFERENCES products(id)
        ON DELETE CASCADE,

    FOREIGN KEY(resource_id)
        REFERENCES course_resources(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_course_access_customer
    ON course_content_access_events(customer_id);

CREATE INDEX IF NOT EXISTS idx_course_access_entitlement
    ON course_content_access_events(course_entitlement_id);

CREATE INDEX IF NOT EXISTS idx_course_access_resource
    ON course_content_access_events(resource_id);