FROM node:20-bullseye

# התקנת כלי בנייה
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# פתרון לבעיית ה-SSH ב-Railway
RUN git config --global url."https://github.com/".insteadOf ssh://git@github.com/

WORKDIR /app

# העתקת קבצי ההגדרות
COPY package*.json ./

# התקנה נקייה ללא סקריפטים שעלולים להכשיל את ה-Build
RUN npm install --legacy-peer-deps --ignore-scripts

# בנייה מחדש של ספריות האבטחה
RUN npm rebuild

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
