Quantum YiJing® v3.4.1e6
Definitive browser syntax + enquiry pipeline repair

ROOT CAUSE CONFIRMED FROM CHROME CONSOLE
Uncaught SyntaxError: Invalid or unexpected token.

The course-enquiry message string was inside the server-generated HTML <script>.
The source used:
    '\n\n'
inside the outer server template literal.
That rendered as a literal newline inside a browser single-quoted JavaScript
string, which broke the entire browser script.

Consequences of that ONE syntax failure:
- 中文 switching stopped
- enquiry submit handler never registered
- browser performed normal GET form submission
- /api/enquiry was never called
- no CRM record
- no QY notification email
- no customer acknowledgement email

v3.4.1e6 fixes:
1. Double-escapes the newline so rendered browser JS is valid.
2. Uses interest='Academy Course'.
3. Sends website='' for this legitimate modal enquiry.
4. Starts anti-spam timer at page initialization, avoiding the <2.5 second
   false rejection when the modal is opened and submitted quickly.
5. Refuses to display success unless /api/enquiry returns a real reference.
6. Does NOT modify /api/enquiry.js.
7. Does NOT modify registration/order/payment logic.

INSTALL
Replace only:
    /functions/product/[slug].js

NO SQL migration.

TEST ORDER
A. Deploy Preview.
B. Open CM2 and press Ctrl+Shift+R / hard refresh.
C. Open DevTools Console: there should be NO red SyntaxError.
D. Test 中文 -> English switching.
E. Submit a new course enquiry (e.g. test84).
F. Network should show POST /api/enquiry.
G. Page must show a real QY-... reference.
H. CRM People & Enquiries must contain test84.
I. QY internal notification email must arrive.
J. Customer acknowledgement email must arrive.
K. Confirm no order was created by enquiry-only flow.
L. Only after A-K pass, test Register / Request a Place.
