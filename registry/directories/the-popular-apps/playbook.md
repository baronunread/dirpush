The public Submit App page lists three routes: free gallery submission with an approximately 10-day delay, $10 Standard, or $50 Sponsored. The paid options include expedited/featured promotion. The form itself was not opened.


Real flow (verified 2026-10-31): Free Submission needs an account. Register (username, company, email, password; the fields are `#NewPassword` and `#RepeatPassword`: `input[type=password]` also matches a hidden login-modal field). The page reloads with no confirmation; a confirmation email likely follows. The login modal has duplicate hidden fields, so `browser login` times out: sign in by hand with explicit selectors.
