import pandas as pd
import json
import os

output = []

# Premier League
df = pd.read_csv("./dados/premier_league_complete_stats_until31thGameDayOnSeason2025-26.csv", encoding="latin-1")
for _, row in df.iterrows():
    output.append({"prompt": f"What are the stats for {row['player_name']}?", "completion": f"{row['player_name']} plays for {row['team_name']} as {row['position']}. Goals: {row['goals']}, Assists: {row['assists']}, Appearances: {row['appearances']}, Rating: {row['rating']}."})
    output.append({"prompt": f"How many goals did {row['player_name']} score?", "completion": f"{row['player_name']} scored {row['goals']} goals in {row['appearances']} appearances."})
    output.append({"prompt": f"What team does {row['player_name']} play for?", "completion": f"{row['player_name']} plays for {row['team_name']}."})

# EV Sales
df = pd.read_csv("./dados/ev_sales_brands.csv", encoding="latin-1")
for _, row in df.iterrows():
    output.append({"prompt": f"How many EVs did {row['brand']} sell in {row['month']}/{row['year']} in {row['country']}?", "completion": f"{row['brand']} sold {row['units_sold']} units in {row['country']} in {row['month']}/{row['year']}."})

# EV Trends
df = pd.read_csv("./dados/ev_trends_monthly.csv", encoding="latin-1")
for _, row in df.iterrows():
    output.append({"prompt": f"What was the trend score for {row['keyword']} in {row['country']} in {row['month']}/{row['year']}?", "completion": f"The trend score for {row['keyword']} in {row['country']} in {row['month']}/{row['year']} was {row['trend_score']}."})

# Top Rated TV
df = pd.read_csv("./dados/top_rated_tv.csv", encoding="latin-1")
for _, row in df.iterrows():
    output.append({"prompt": f"What is {row['name']} about?", "completion": f"{row['name']} aired on {row['first_air_date']}. {row['overview']} It has a rating of {row['vote_average']} with {row['vote_count']} votes."})
    output.append({"prompt": f"What is the rating of {row['name']}?", "completion": f"{row['name']} has a rating of {row['vote_average']} based on {row['vote_count']} votes."})

# Guardar
os.makedirs("./finetune", exist_ok=True)
with open("./finetune/dataset.jsonl", "w", encoding="utf-8") as f:
    for item in output:
        f.write(json.dumps(item, ensure_ascii=False) + "\n")

print(f"✅ Dataset criado com {len(output)} pares pergunta/resposta em ./finetune/dataset.jsonl")