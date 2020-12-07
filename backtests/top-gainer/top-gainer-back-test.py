import matplotlib.pyplot as plt
import numpy as np
import yfinance as yf
import pandas as pd


# First I need some stock data, lets fetch open and close prices for the top gainers for today

tickers = ["RYCEY", "JMIA", "PDCO", "RYCEF", "OPK", "SPOT", "ACB", "BNDSY", "SPR", "ACIW", "LSPD"]



# Step 1. We want to get the Change % of the passed in tickers over the last 6 months, on each hour of the day


# Get the data for the stock AAPL
# data = yf.download(tickers=tickers,period='1mo')

# # Plot the close price of the AAPL
# data['Adj Close'].plot(figsize=(20,20))
  
# # # naming the x axis 
# plt.xlabel('x - axis') 
# # # naming the y axis 
# plt.ylabel('y - axis') 
  
# # # giving a title to my graph 
# plt.title('Top Gainer Regression Test') 
  
# # # function to show the plot 
# plt.savefig('test.png')