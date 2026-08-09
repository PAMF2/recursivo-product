# Recursivo Verify - landing + deck + Verify API num container so (stdlib, zero deps).
FROM python:3.13-slim
WORKDIR /app
COPY . /app
EXPOSE 7860
CMD ["python", "api/app.py", "7860"]
