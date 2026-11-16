FROM python:3.11-slim

WORKDIR /app
COPY server/ ./server/
COPY web/ ./web/
COPY start.sh ./start.sh
RUN chmod +x ./start.sh && mkdir -p /app/data

ENV HOST=0.0.0.0
ENV PORT=8780
ENV DATA_DIR=/app/data

EXPOSE 8780
VOLUME ["/app/data"]

CMD ["python3", "server/app.py", "--host", "0.0.0.0", "--port", "8780"]
