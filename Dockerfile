FROM node:20-bullseye

# התקנת כלים בסיסיים לבנייה ו-Git
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# הגדרה קריטית לעקיפת שגיאת ה-SSH ב-Railway
RUN git config --global url."https://github.com/".insteadOf ssh://git@github.com/

WORKDIR /app

# העתקת קבצי ההגדרות קודם (בשביל Cache יעיל)
COPY package*.json ./

# התקנה נקייה
RUN npm install --legacy-peer-deps

# העתקת שאר הקוד
COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
