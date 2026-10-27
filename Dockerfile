FROM python:3.12-slim
WORKDIR /app
COPY marketsim marketsim
COPY web web
RUN useradd --create-home marketsim
USER marketsim
ENV PORT=8000
EXPOSE 8000
CMD ["python", "-m", "marketsim.server"]
