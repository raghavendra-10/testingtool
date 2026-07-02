CREATE TABLE IF NOT EXISTS outbound_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT,
  events TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS spec_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed some starter templates
INSERT INTO spec_templates (name, category, description, content) VALUES
('REST Authentication', 'auth', 'Standard auth requirements: login, register, token refresh, password reset', 'REQ-001: User Registration
The system shall allow users to register with email and password.
Password must be at least 8 characters.
Priority: High

REQ-002: User Login
The system shall authenticate users via email/password and return a JWT token.
Invalid credentials shall return 401.
Priority: High

REQ-003: Token Refresh
The system shall allow refreshing expired tokens using a refresh token.
Expired refresh tokens shall return 401.
Priority: High

REQ-004: Password Reset
The system shall send a reset link via email.
Reset links shall expire after 1 hour.
Priority: Medium'),

('CRUD Operations', 'crud', 'Standard CRUD requirements for a resource: list, get, create, update, delete', 'REQ-001: List Resources
The system shall return a paginated list of resources.
Support query params: page, limit, sort, filter.
Priority: High

REQ-002: Get Resource by ID
The system shall return a single resource by its ID.
Non-existent IDs shall return 404.
Priority: High

REQ-003: Create Resource
The system shall create a new resource from a valid JSON body.
Missing required fields shall return 400 with field-level errors.
Priority: High

REQ-004: Update Resource
The system shall update an existing resource via PUT/PATCH.
Partial updates via PATCH shall only modify provided fields.
Priority: High

REQ-005: Delete Resource
The system shall delete a resource by ID.
Deleting a non-existent resource shall return 404.
Priority: Medium'),

('Payment Processing', 'payments', 'Payment API requirements: charges, refunds, webhooks', 'REQ-001: Create Charge
The system shall process a payment charge with amount, currency, and payment method.
Amounts must be positive integers (cents).
Priority: High

REQ-002: Retrieve Charge
The system shall return charge details by charge ID.
Include status: pending, succeeded, failed.
Priority: High

REQ-003: Refund Charge
The system shall allow full or partial refunds on succeeded charges.
Cannot refund more than the original amount.
Priority: High

REQ-004: List Charges
The system shall list charges with filters: status, date range, customer.
Support pagination via cursor.
Priority: Medium

REQ-005: Payment Webhooks
The system shall send webhooks for: charge.succeeded, charge.failed, refund.created.
Webhooks shall include HMAC signature for verification.
Priority: High');
