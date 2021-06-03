<?xml version="1.0"?>
<xsl:stylesheet version="1.1" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
    <xsl:output method="html" encoding="utf-8" indent="yes"/>

    <xsl:template match="/">
        <xsl:choose>
            <xsl:when test="//*[local-name()='Contents'] or //*[local-name()='CommonPrefixes']">
                <xsl:apply-templates select="*[local-name()='ListBucketResult']" />
            </xsl:when>
            <xsl:otherwise>
                <xsl:call-template name="no_contents"/>
            </xsl:otherwise>
        </xsl:choose>

    </xsl:template>

    <xsl:template name="no_contents">
        <html>
            <head><title>Not Found</title></head>
            <body>
                <h1>Not Found</h1>
            </body>
        </html>
    </xsl:template>

    <xsl:template match="*[local-name()='ListBucketResult']">
        <xsl:text disable-output-escaping='yes'>&lt;!DOCTYPE html&gt;</xsl:text>
        <xsl:variable name="globalPrefix"
                      select="*[local-name()='Prefix']/text()"/>
        <html>
            <head>
                <title><xsl:value-of select="$globalPrefix"/>
                </title>
            </head>
            <body>
                <h1>Index of /<xsl:value-of select="$globalPrefix"/></h1>
                <hr/>
                <table id="list">
                    <thead>
                        <tr>
                            <th style="text-align: left; width:55%">Filename
                            </th>
                            <th style="text-align: left; width:20%">File Size
                            </th>
                            <th style="text-align: left; width:25%">Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        <xsl:if test="string-length($globalPrefix) > 0">
                            <tr>
                                <td>
                                    <a href="../">..</a>
                                </td>
                            </tr>
                        </xsl:if>
                        <xsl:apply-templates
                                select="*[local-name()='CommonPrefixes']">
                            <xsl:with-param name="globalPrefix"
                                            select="$globalPrefix"/>
                        </xsl:apply-templates>
                        <xsl:apply-templates
                                select="*[local-name()='Contents']">
                            <xsl:with-param name="globalPrefix"
                                            select="$globalPrefix"/>
                        </xsl:apply-templates>
                    </tbody>
                </table>
            </body>
        </html>
    </xsl:template>
    <xsl:template match="*[local-name()='CommonPrefixes']">
        <xsl:param name="globalPrefix"/>
        <xsl:apply-templates select=".//*[local-name()='Prefix']">
            <xsl:with-param name="globalPrefix" select="$globalPrefix"/>
        </xsl:apply-templates>
    </xsl:template>
    <xsl:template match="*[local-name()='Prefix']">
        <xsl:param name="globalPrefix"/>
        <xsl:if test="not(text()=$globalPrefix)">
            <xsl:variable name="dirName"
                          select="substring-after(text(), $globalPrefix)"/>
            <tr>
                <td>
                    <a href="/{text()}">
                        <xsl:value-of select="$dirName"/>
                    </a>
                </td>
                <td/>
                <td/>
            </tr>
        </xsl:if>
    </xsl:template>

    <xsl:template match="*[local-name()='Contents']">
        <xsl:param name="globalPrefix"/>
        <xsl:variable name="key" select="*[local-name()='Key']/text()"/>

        <xsl:if test="not($key=$globalPrefix)">
            <xsl:variable name="fileName"
                          select="substring-after($key, $globalPrefix)"/>
            <xsl:variable name="date"
                          select="*[local-name()='LastModified']/text()"/>
            <xsl:variable name="size" select="*[local-name()='Size']/text()"/>
            <tr>
                <td>
                    <a href="/{$key}">
                        <xsl:value-of select="$fileName"/>
                    </a>
                </td>
                <td>
                    <xsl:value-of select="$size"/>
                </td>
                <td>
                    <xsl:value-of select="$date"/>
                </td>
            </tr>
        </xsl:if>
    </xsl:template>
</xsl:stylesheet>
