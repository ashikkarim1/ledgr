#!/bin/bash

# List of HTML files to update
files=(
  "index.html"
  "pricing.html"
  "dashboard.html"
  "agents.html"
  "demo.html"
  "resources.html"
  "security.html"
  "customers.html"
  "coming-soon.html"
  "calculator.html"
  "extractor.html"
  "guide-e-invoicing.html"
  "onboarding.html"
  "404.html"
  "trial.html"
)

# Hamburger menu toggle HTML (3 spaces indentation to match)
hamburger='        <button class="nav__menu-toggle" aria-label="Toggle navigation menu">\n          <span></span>\n          <span></span>\n          <span></span>\n        </button>'

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    # Check if hamburger menu already exists
    if grep -q 'nav__menu-toggle' "$file"; then
      echo "✓ $file already has hamburger menu"
    else
      # Find the line with closing </div> for nav__inner and insert before it
      # Use sed to insert the hamburger menu before the closing nav__inner div
      sed -i '' "/<\/div>.*nav__inner/s/      <\/div>/        <button class=\"nav__menu-toggle\" aria-label=\"Toggle navigation menu\">\n          <span><\/span>\n          <span><\/span>\n          <span><\/span>\n        <\/button>\n      <\/div>/" "$file"
      echo "✓ Added hamburger menu to $file"
    fi
  else
    echo "✗ File not found: $file"
  fi
done

echo "Done!"
