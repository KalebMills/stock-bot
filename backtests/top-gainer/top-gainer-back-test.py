import matplotlib.pyplot as plt
import numpy as np
import yfinance as yf
import pandas as pd


# First I need some stock data, lets fetch open and close prices for the top gainers for today

tickers = ["RYCEY", "JMIA", "PDCO", "RYCEF", "OPK", "SPOT", "ACB", "BNDSY", "SPR", "ACIW", "LSPD"]

# data = yf.download(tickers=tickers, period='1m')

# open_data = data['Open'].plot(figsize=(16, 9))
# print(str(open_data))
# close_data = data['Close'].plot(figsize=(16, 9))

# ((open_data).cumprod()).plot(figsize=(10, 7))
# ((close_data).cumprod()).plot(figsize=(10, 7))


# Get the data for the stock AAPL
data = yf.download(tickers=tickers,period='1mo')

# Plot the close price of the AAPL
data['Adj Close'].plot(figsize=(20,20))

  
# # x axis values 
# x = np.array([11,11,6,11,11,7,7,9,12,11,9,8,13,9,11,11,11,12,11,12,8,11,13,9,11])


# # corresponding y axis values 
# y = np.array([12,11,5,11,9,5,9,9,11,9,7,9,12,11,11,14,7,12,11,11,7,9,7,11,8])


# m, b = np.polyfit(open_data, close_data, 1)

# # Calculate slope
# slope = m*x + b
  
# # plotting the points  
# plt.plot(x, y, 'o') 
# plt.plot(x, slope)
  
# # naming the x axis 
plt.xlabel('x - axis') 
# # naming the y axis 
plt.ylabel('y - axis') 
  
# # giving a title to my graph 
plt.title('Top Gainer Regression Test') 
  
# # function to show the plot 
plt.savefig('test.png')