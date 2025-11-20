// Handle Sign In Form
const signInForm = document.querySelector(".sign-in-form");
if (signInForm) {
  signInForm.addEventListener("submit", function (e) {
    e.preventDefault();

    const identity = document.getElementById("signin-identity").value;
    const password = document.getElementById("signin-password").value;

    const user = demoUsers.find(
      u => u.email === identity && u.password === password
    );

    if (user) {
      localStorage.setItem("loggedInUser", JSON.stringify(user));
      alert("Login successful!");

      // Redirect back to the page user came from, if saved
      const redirectPage = localStorage.getItem("redirectAfterLogin");
      if (redirectPage) {
        localStorage.removeItem("redirectAfterLogin"); // clear once used
        window.location.href = redirectPage;
      } else {
        window.location.href = "index.html"; // fallback
      }
    } else {
      alert("Invalid email or password.");
    }
  });
}

// 🔹 Global helper for protected actions
function requireLogin() {
  if (!localStorage.getItem("loggedInUser")) {
    // Save current page before redirecting
    localStorage.setItem("redirectAfterLogin", window.location.href);
    window.location.href = "login_signup.html";
    return false; // prevent link navigation
  }
  return true; // allow link navigation
}
