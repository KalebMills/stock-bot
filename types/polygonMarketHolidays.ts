export type PolygonMarketHolidays = MarketHolidaysArray[]

export interface MarketHolidaysArray {
    exchange: string,
    market: string,
    date: string,
    status: string,
    open?: string,
    close?: string
}