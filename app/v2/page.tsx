/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { InfoIcon, AlertCircle, FileIcon, BarChart } from "lucide-react";

export default function Home() {
    const [numFiles, setNumFiles] = useState<number>(1);
    const [fileInputs, setFileInputs] = useState<Array<File | null>>([null]);
    const [fileNames, setFileNames] = useState<Array<string>>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [apiResponse, setApiResponse] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [parsedResults, setParsedResults] = useState<any>(null);

    const fileInputRefs = useRef<Array<HTMLInputElement | null>>([]);

    useEffect(() => {
        // Update file inputs when numFiles changes
        setFileInputs(Array(numFiles).fill(null));
        setFileNames(Array(numFiles).fill(''));
        fileInputRefs.current = Array(numFiles).fill(null);
    }, [numFiles]);

    const handleNumFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseInt(e.target.value);
        if (value > 0 && value <= 5) { // Changed max to 5 to match backend limitation
            setNumFiles(value);
        }
    };

    const handleFileChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const newFileInputs = [...fileInputs];
            newFileInputs[index] = e.target.files[0];
            setFileInputs(newFileInputs);

            const newFileNames = [...fileNames];
            newFileNames[index] = e.target.files[0].name;
            setFileNames(newFileNames);
        }
    };

    const validateCSVFiles = async (files: Array<File | null>): Promise<{ valid: boolean, datasets: any[] }> => {
        const datasets: any[] = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (!file) {
                setError("Please upload all required CSV files.");
                return { valid: false, datasets: [] };
            }

            if (!file.name.toLowerCase().endsWith('.csv')) {
                setError(`File ${file.name} is not a CSV file.`);
                return { valid: false, datasets: [] };
            }

            // Parse the CSV file
            try {
                const result = await new Promise<Papa.ParseResult<any>>((resolve, reject) => {
                    Papa.parse(file, {
                        header: true,
                        skipEmptyLines: true,
                        complete: resolve,
                        error: reject
                    });
                });

                const data = result.data;

                // Check if required columns exist
                if (!data[0] || !('Day No.' in data[0]) || !('Number of entries' in data[0])) {
                    setError(`File ${file.name} is missing required columns 'Day No.' and/or 'Number of entries'.`);
                    return { valid: false, datasets: [] };
                }

                // Add the dataset
                datasets.push({
                    name: file.name.split('.').slice(0, -1).join('.'), // Remove .csv extension
                    data: data
                });
            } catch (err) {
                setError(`Error parsing file ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
                return { valid: false, datasets: [] };
            }
        }

        return { valid: true, datasets };
    };

    const handleSubmit = async () => {
        setIsLoading(true);
        setError(null);
        setApiResponse(null);
        setParsedResults(null);

        try {
            const validationResult = await validateCSVFiles(fileInputs);

            if (!validationResult.valid) {
                setIsLoading(false);
                return;
            }

            // Use the new API URL
            const apiUrl = 'https://mldpbs-api-v2.onrender.com/predict';

            // Use AbortController to implement timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout to match backend

            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(validationResult.datasets),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`API request failed with status ${response.status}: ${await response.text()}`);
                }

                const result = await response.json();
                setApiResponse(result);
                console.log(result);

                // Parse the buddy allocation output for display
                if (result.buddy_allocation_output) {
                    try {
                        const lines = result.buddy_allocation_output.split('\n');
                        const resultsTable = [];
                        let headerLine = null;
                        let inResults = false;

                        for (const line of lines) {
                            if (line.trim() === 'Results:') {
                                inResults = true;
                            } else if (inResults && line.includes('Block Size')) {
                                headerLine = line.trim().split('\t');
                            } else if (inResults && line.trim() && headerLine) {
                                const values = line.trim().split('\t');
                                if (values.length === headerLine.length) {
                                    resultsTable.push(values);
                                }
                            }
                        }

                        if (headerLine && resultsTable.length > 0) {
                            setParsedResults({
                                headers: headerLine,
                                data: resultsTable
                            });
                        }
                    } catch (err) {
                        console.error('Error parsing buddy allocation output:', err);
                    }
                }
            } catch (err) {
                throw err;
            }
        } catch (err) {
            console.error('Error:', err);
            setError(err instanceof Error ? err.message : 'An unknown error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="container mx-auto py-8 px-4">

            <div className="text-center mb-10">
                <h1 className="text-4xl font-bold tracking-tight">ML Dynamic Prediction Based Buddy System V2</h1>
                <p className="text-lg text-muted-foreground mt-4">
                    Upload your CSV files with resource usage data to predict optimal memory allocation
                </p>
            </div>

            <Card className="mb-8">
                <CardHeader>
                    <CardTitle>Upload Data</CardTitle>
                    <CardDescription>
                        Please provide CSV files containing resource usage data
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="numFiles">How many CSV files would you like to upload?</Label>
                            <Input
                                id="numFiles"
                                type="number"
                                value={numFiles}
                                onChange={handleNumFilesChange}
                                min={1}
                                max={5} // Changed max to 5 to match backend limitation
                                className="w-24"
                            />
                            <p className="text-sm text-muted-foreground">
                                Each CSV must contain &apos;Day No.&apos; and &apos;Number of entries&apos; columns (maximum 5 files)
                            </p>
                        </div>

                        <div className="space-y-4">
                            <Label>Upload your CSV files:</Label>
                            {Array(numFiles).fill(0).map((_, index) => (
                                <div key={index} className="grid gap-2">
                                    <div className="flex items-center gap-4">
                                        <div className="flex-1">
                                            <Label htmlFor={`file-${index}`} className="mb-1 block">
                                                Dataset {index + 1} <span className="text-destructive">*</span>
                                            </Label>
                                            <Input
                                                id={`file-${index}`}
                                                type="file"
                                                accept=".csv"
                                                onChange={(e) => handleFileChange(index, e as React.ChangeEvent<HTMLInputElement>)}
                                                ref={(el) => { fileInputRefs.current[index] = el; }}
                                            />
                                        </div>
                                        {fileNames[index] && (
                                            <p className="text-sm flex items-center">
                                                <FileIcon className="h-4 w-4 mr-2" />
                                                {fileNames[index]}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </CardContent>
                <CardFooter>
                    <Button
                        onClick={handleSubmit}
                        disabled={isLoading}
                        className="w-full"
                    >
                        {isLoading ? "Processing..." : "Process Data"}
                    </Button>
                </CardFooter>
            </Card>

            {isLoading && (
                <div className="flex flex-col items-center justify-center p-10">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
                    <p className="text-center">Processing your data... This may take several minutes for large datasets.</p>
                    <p className="text-center text-sm text-muted-foreground mt-2">Your data is being processed in batches and analyzed by multiple ML models</p>
                </div>
            )}

            {error && (
                <Alert variant="destructive" className="mb-8">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {apiResponse && (
                <div className="space-y-8">
                    <Tabs defaultValue="datasets">
                        <TabsList className="grid w-full grid-cols-4">
                            <TabsTrigger value="datasets">Dataset Summaries</TabsTrigger>
                            <TabsTrigger value="batches">Batch Results</TabsTrigger>
                            <TabsTrigger value="performance">Allocation Performance</TabsTrigger>
                            <TabsTrigger value="details">Detailed Results</TabsTrigger>
                        </TabsList>

                        <TabsContent value="datasets" className="space-y-4">
                            <h2 className="text-2xl font-bold mt-4">Dataset Summaries</h2>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {Object.entries(apiResponse.dataset_summaries || {}).map(([datasetName, summary]: [string, any], idx: number) => (
                                    <Card key={idx}>
                                        <CardHeader className="pb-2">
                                            <CardTitle className="text-lg">{datasetName}</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="text-3xl font-bold">{summary.total_percentage.toFixed(2)}%</div>
                                            <p className="text-sm text-muted-foreground">of total allocation</p>
                                            <p className="text-sm mt-2">{summary.batches.length} batches processed</p>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </TabsContent>

                        <TabsContent value="batches" className="space-y-4">
                            <h2 className="text-2xl font-bold mt-4">Batch Results</h2>
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Batch Name</TableHead>
                                            <TableHead>XGBoost Average</TableHead>
                                            <TableHead>Allocation Percentage</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {(apiResponse.batch_predictions || []).map((batch: any, idx: number) => (
                                            <TableRow key={idx}>
                                                <TableCell>{batch.batch_name}</TableCell>
                                                <TableCell>{batch.xgb_average.toFixed(2)}</TableCell>
                                                <TableCell>{batch.percentage.toFixed(2)}%</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </TabsContent>

                        <TabsContent value="performance">
                            {parsedResults ? (
                                <div>
                                    <h2 className="text-2xl font-bold mb-4">Memory Allocation Performance</h2>
                                    <div className="rounded-md border">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    {parsedResults.headers.map((header: string, idx: number) => (
                                                        <TableHead key={idx}>{header}</TableHead>
                                                    ))}
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {parsedResults.data.map((row: string[], rowIdx: number) => (
                                                    <TableRow key={rowIdx}>
                                                        {row.map((cell, cellIdx) => (
                                                            <TableCell key={cellIdx}>{cell}</TableCell>
                                                        ))}
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center p-8 text-muted-foreground">
                                    <InfoIcon className="mx-auto h-8 w-8 mb-2" />
                                    <p>No allocation performance data available</p>
                                </div>
                            )}
                        </TabsContent>

                        <TabsContent value="details">
                            <h2 className="text-2xl font-bold mb-4">Detailed Results</h2>

                            <Accordion type="single" collapsible className="w-full">
                                <AccordionItem value="batch-details">
                                    <AccordionTrigger>Batch Processing Details</AccordionTrigger>
                                    <AccordionContent>
                                        <div className="space-y-6">
                                            {(apiResponse.batch_predictions || []).map((batch: any, idx: number) => (
                                                <div key={idx} className="space-y-2">
                                                    <h3 className="text-lg font-semibold">{batch.batch_name}</h3>
                                                    <div className="ml-4 space-y-1">
                                                        <p><span className="font-medium">XGBoost Average:</span> {batch.xgb_average.toFixed(4)}</p>
                                                        <p><span className="font-medium">Percentage:</span> {batch.percentage.toFixed(2)}%</p>

                                                        {batch.results && Object.entries(batch.results).map(([modelName, modelResults]: [string, any]) => (
                                                            <div key={modelName} className="ml-4 mt-2">
                                                                <p className="font-medium">{modelName}:</p>
                                                                <p className="text-sm">MSE: {modelResults.mse.toFixed(4)}</p>
                                                                {modelResults.predictions && (
                                                                    <div className="flex items-center gap-2 mt-1">
                                                                        <BarChart className="h-4 w-4" />
                                                                        <p className="text-xs text-muted-foreground">
                                                                            Predictions: {modelResults.predictions.map((val: number) => val.toFixed(1)).join(', ')}
                                                                        </p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <Separator className="my-4" />
                                                </div>
                                            ))}
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>

                                <AccordionItem value="dataset-summaries">
                                    <AccordionTrigger>Dataset Summaries</AccordionTrigger>
                                    <AccordionContent>
                                        <div className="space-y-6">
                                            {Object.entries(apiResponse.dataset_summaries || {}).map(([datasetName, summary]: [string, any], idx: number) => (
                                                <div key={idx} className="space-y-2">
                                                    <h3 className="text-lg font-semibold">{datasetName}</h3>
                                                    <p className="ml-4"><span className="font-medium">Total Percentage:</span> {summary.total_percentage.toFixed(2)}%</p>
                                                    <div className="ml-4 mt-2">
                                                        <p className="font-medium">Batches:</p>
                                                        <div className="rounded-md border mt-2">
                                                            <Table>
                                                                <TableHeader>
                                                                    <TableRow>
                                                                        <TableHead>Batch Name</TableHead>
                                                                        <TableHead>XGBoost Average</TableHead>
                                                                        <TableHead>Percentage</TableHead>
                                                                    </TableRow>
                                                                </TableHeader>
                                                                <TableBody>
                                                                    {summary.batches.map((batch: any, batchIdx: number) => (
                                                                        <TableRow key={batchIdx}>
                                                                            <TableCell>{batch.batch_name}</TableCell>
                                                                            <TableCell>{batch.xgb_average.toFixed(2)}</TableCell>
                                                                            <TableCell>{batch.percentage.toFixed(2)}%</TableCell>
                                                                        </TableRow>
                                                                    ))}
                                                                </TableBody>
                                                            </Table>
                                                        </div>
                                                    </div>
                                                    <Separator className="my-4" />
                                                </div>
                                            ))}
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>

                                <AccordionItem value="raw-response">
                                    <AccordionTrigger>Raw API Response</AccordionTrigger>
                                    <AccordionContent>
                                        <div className="bg-muted p-4 rounded-md overflow-x-auto">
                                            <pre className="text-xs font-mono">{JSON.stringify(apiResponse, null, 2)}</pre>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                        </TabsContent>
                    </Tabs>
                </div>
            )}
        </div>
    );
}